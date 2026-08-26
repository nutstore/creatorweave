declare module '@webcontainer/api' {
  export interface WebContainerProcess {
    output: ReadableStream<string>
    exit: Promise<number>
    kill: () => void
  }

  export interface WebContainer {
    mount: (tree: unknown) => Promise<void>
    spawn: (
      command: string,
      args?: string[],
      options?: {
        cwd?: string
        env?: Record<string, string>
      }
    ) => Promise<WebContainerProcess>
    on: (event: 'server-ready', listener: (port: number, url: string) => void) => void
    teardown?: () => Promise<void> | void
  }

  export const WebContainer: {
    boot: () => Promise<WebContainer>
  }
}
