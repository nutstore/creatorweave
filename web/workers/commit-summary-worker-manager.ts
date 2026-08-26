type DiffInput = {
  path: string
  beforeText: string
  afterText: string
  isBinary?: boolean
}

type BuildRequest = {
  id: string
  type: 'BUILD_DIFF_SECTIONS'
  payload: {
    inputs: DiffInput[]
    contextLines?: number
    maxOutputLines?: number
    maxNoChangeLines?: number
  }
}

type WorkerResponse =
  | {
      id: string
      type: 'BUILD_DIFF_SECTIONS_RESULT'
      payload: { sections: string[] }
    }
  | {
      id: string
      type: 'ERROR'
      payload: { error: string }
    }

class CommitSummaryWorkerManager {
  private worker: Worker | null = null
  private pending = new Map<
    string,
    {
      resolve: (value: string[]) => void
      reject: (reason?: unknown) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./commit-summary.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data
        const waiter = this.pending.get(message.id)
        if (!waiter) return
        clearTimeout(waiter.timeout)
        this.pending.delete(message.id)
        if (message.type === 'BUILD_DIFF_SECTIONS_RESULT') {
          waiter.resolve(message.payload.sections)
        } else {
          waiter.reject(new Error(message.payload.error))
        }
      }
      this.worker.onerror = (event: ErrorEvent) => {
        const err = new Error(`Commit summary worker error: ${event.message}`)
        for (const [, waiter] of this.pending) {
          clearTimeout(waiter.timeout)
          waiter.reject(err)
        }
        this.pending.clear()
      }
    }
    return this.worker
  }

  async buildDiffSections(
    inputs: DiffInput[],
    options?: {
      contextLines?: number
      maxOutputLines?: number
      maxNoChangeLines?: number
      timeoutMs?: number
    }
  ): Promise<string[]> {
    if (inputs.length === 0) return []
    const worker = this.getWorker()
    const id = `commit-summary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const timeoutMs = options?.timeoutMs ?? 2500

    return new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Commit summary worker timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })

      const request: BuildRequest = {
        id,
        type: 'BUILD_DIFF_SECTIONS',
        payload: {
          inputs,
          contextLines: options?.contextLines ?? 2,
          maxOutputLines: options?.maxOutputLines ?? 120,
          maxNoChangeLines: options?.maxNoChangeLines ?? 30,
        },
      }
      worker.postMessage(request)
    })
  }
}

const manager = new CommitSummaryWorkerManager()

export type { DiffInput as CommitSummaryDiffInput }

export async function buildCommitSummaryDiffSections(
  inputs: DiffInput[],
  options?: {
    contextLines?: number
    maxOutputLines?: number
    maxNoChangeLines?: number
    timeoutMs?: number
  }
): Promise<string[]> {
  return await manager.buildDiffSections(inputs, options)
}
