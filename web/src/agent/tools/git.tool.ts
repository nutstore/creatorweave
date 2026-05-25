/**
 * Git Tools - OPFS 版本 Git 基础工具
 *
 * 提供浏览器版本的 Git 命令，基于现有的变更追踪和快照系统实现。
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { toolErrorJson, toolOkJson } from './tool-envelope'

// 导入 Git 工具实现
import { 
  gitStatus, 
  formatGitStatus,
  gitDiff,
  formatGitDiff,
  gitLog,
  formatGitLog,
  formatGitLogOneline,
  gitShow,
  formatGitShow,
  gitRestore,
  formatGitRestore
} from '@/opfs/git'

function parseFormat(raw: unknown): { ok: true; format: 'json' | 'text' } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, format: 'text' }
  if (raw === 'json' || raw === 'text') return { ok: true, format: raw }
  return { ok: false, error: `format must be "json" or "text"` }
}

function ensureWorkspaceId(context: { workspaceId?: string | null }): string | null {
  const workspaceId = context.workspaceId
  if (!workspaceId) return null
  return workspaceId
}

function ensureProjectId(context: { projectId?: string | null }): string | null {
  const projectId = context.projectId
  if (!projectId) return null
  return projectId
}

function parseBooleanArg(value: unknown, name: string): { ok: true; value: boolean } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: false }
  if (typeof value === 'boolean') return { ok: true, value }
  return { ok: false, error: `${name} must be boolean` }
}

/**
 * 当 path 过滤无结果时，构建路径提示信息。
 * 检查已有文件路径中是否有以某个公共前缀开头的，暗示用户可能遗漏了 root 前缀。
 */
function buildPathHint(inputPath: string, existingFiles: Array<{ path: string }>): string | undefined {
  // 从已有文件路径中提取所有可能的 root 前缀（第一个 / 之前的部分）
  const roots = new Set<string>()
  for (const f of existingFiles) {
    const slashIdx = f.path.indexOf('/')
    if (slashIdx > 0) {
      roots.add(f.path.substring(0, slashIdx))
    }
  }

  // 如果没有任何 root 前缀（单根项目），无需提示
  if (roots.size === 0) return undefined

  // 检查用户输入是否以某个 root 开头
  const alreadyHasRoot = [...roots].some((r) => inputPath.startsWith(r + '/'))
  if (alreadyHasRoot) {
    // 已有正确前缀但无结果，可能是路径本身有误
    return undefined
  }

  // 猜测：用户可能遗漏了 root 前缀
  const suggestions = [...roots]
    .map((r) => `${r}/${inputPath}`)
    .filter((candidate) =>
      existingFiles.some((f) => f.path.startsWith(candidate))
    )

  if (suggestions.length === 1) {
    return `Did you mean "${suggestions[0]}"? (path needs root prefix)`
  } else if (suggestions.length > 1) {
    return `Possible paths: ${suggestions.map((s) => `"${s}"`).join(', ')}`
  }

  // 没有精确匹配，但还是提示用户 root 前缀
  const rootList = [...roots].join(', ')
  const firstRoot = roots.values().next().value
  return `This project has multi-root layout. Available roots: [${rootList}]. Try "${firstRoot}/${inputPath}"`
}

//=============================================================================
// git_status - 查看工作区状态
//=============================================================================

export const gitStatusDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_status',
    description:
      'Show the working tree status. Lists changes in working directory and staged changes. ' +
      'Based on pending_ops and fs_changesets tables.',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text (git-style output)',
        },
      },
    },
  },
}

export const gitStatusExecutor: ToolExecutor = async (args, context) => {
  try {
    const workspaceId = ensureWorkspaceId(context)
    if (!workspaceId) {
      return toolErrorJson('git_status', 'no_active_workspace', 'No active workspace')
    }

    const parsedFormat = parseFormat(args.format)
    if (!parsedFormat.ok) {
      return toolErrorJson('git_status', 'invalid_arguments', parsedFormat.error)
    }

    const result = await gitStatus(workspaceId)
    const output = formatGitStatus(result)
    if (parsedFormat.format === 'json') {
      return toolOkJson('git_status', {
        format: 'json',
        status: result,
      })
    }

    return toolOkJson('git_status', {
      format: 'text',
      output,
      status: result,
    })
  } catch (error) {
    return toolErrorJson(
      'git_status',
      'internal_error',
      `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

//=============================================================================
// git_diff - 查看文件差异
//=============================================================================

export const gitDiffDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_diff',
    description:
      'Show changes between commits, commit and working tree, etc. ' +
      'Modes: working (default) = pending changes, cached = staged changes, snapshot = specific snapshot.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['working', 'cached', 'snapshot'],
          description: 'Diff mode. working=uncommitted changes, cached=staged changes, snapshot=specific snapshot',
        },
        snapshot_id: {
          type: 'string',
          description: 'Snapshot ID for snapshot mode',
        },
        cached: {
          type: 'boolean',
          description: 'Alias of --cached. Equivalent to mode="cached".',
        },
        path: {
          type: 'string',
          description: 'Filter by path prefix',
        },
        name_only: {
          type: 'boolean',
          description: 'Show only names of changed files',
        },
        name_status: {
          type: 'boolean',
          description: 'Show names and status (A/M/D) of changed files',
        },
        stat: {
          type: 'boolean',
          description: 'Show diffstat summary',
        },
        numstat: {
          type: 'boolean',
          description: 'Show numeric diffstat summary',
        },
        patch: {
          type: 'boolean',
          description: 'Show patch body (default true unless stat/numstat/name_only/name_status is used)',
        },
        unified: {
          type: 'number',
          description: 'Generate diffs with <n> lines of context (like -U<n>)',
        },
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text (unified diff)',
        },
      },
    },
  },
}

export const gitDiffExecutor: ToolExecutor = async (args, context) => {
  try {
    const workspaceId = ensureWorkspaceId(context)
    if (!workspaceId) {
      return toolErrorJson('git_diff', 'no_active_workspace', 'No active workspace')
    }

    const modeRaw = args.mode
    let mode = (modeRaw as 'working' | 'cached' | 'snapshot') || 'working'
    if (mode !== 'working' && mode !== 'cached' && mode !== 'snapshot') {
      return toolErrorJson(
        'git_diff',
        'invalid_arguments',
        'mode must be one of: working, cached, snapshot'
      )
    }

    const cachedParsed = parseBooleanArg(args.cached, 'cached')
    if (!cachedParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', cachedParsed.error)
    }
    if (cachedParsed.value) {
      if (args.mode !== undefined && mode !== 'cached') {
        return toolErrorJson(
          'git_diff',
          'invalid_arguments',
          'cached=true conflicts with mode. Use mode="cached" or remove mode.'
        )
      }
      mode = 'cached'
    }

    const snapshotId = args.snapshot_id as string | undefined
    if (mode === 'snapshot' && !snapshotId) {
      return toolErrorJson('git_diff', 'invalid_arguments', 'snapshot_id is required when mode="snapshot"')
    }

    const nameOnlyParsed = parseBooleanArg(args.name_only, 'name_only')
    if (!nameOnlyParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', nameOnlyParsed.error)
    }
    const nameStatusParsed = parseBooleanArg(args.name_status, 'name_status')
    if (!nameStatusParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', nameStatusParsed.error)
    }
    if (nameOnlyParsed.value && nameStatusParsed.value) {
      return toolErrorJson(
        'git_diff',
        'invalid_arguments',
        'name_only and name_status cannot both be true'
      )
    }

    const statParsed = parseBooleanArg(args.stat, 'stat')
    if (!statParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', statParsed.error)
    }
    const numstatParsed = parseBooleanArg(args.numstat, 'numstat')
    if (!numstatParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', numstatParsed.error)
    }

    const patchParsed = parseBooleanArg(args.patch, 'patch')
    if (!patchParsed.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', patchParsed.error)
    }

    const unified = args.unified as number | undefined
    if (unified !== undefined && (!Number.isFinite(unified) || unified < 0 || !Number.isInteger(unified))) {
      return toolErrorJson('git_diff', 'invalid_arguments', 'unified must be a non-negative integer')
    }

    const path = args.path as string | undefined
    const parsedFormat = parseFormat(args.format)
    if (!parsedFormat.ok) {
      return toolErrorJson('git_diff', 'invalid_arguments', parsedFormat.error)
    }

    const result = await gitDiff(workspaceId, {
      mode,
      snapshotId,
      path,
      directoryHandle: null,
      contextLines: unified,
    })

    // 如果 path 过滤后无结果，检查是否需要提示路径前缀
    const filesChanged = result?.summary?.filesChanged ?? result?.files?.length ?? 0
    const hasPath = !!path
    let pathHint: string | undefined

    if (hasPath && filesChanged === 0) {
      // 额外查一次不带 path 的 diff，提取 root 前缀用于提示
      try {
        const fullResult = await gitDiff(workspaceId, {
          mode,
          snapshotId,
          path: undefined,
          directoryHandle: null,
          contextLines: unified,
        })
        pathHint = buildPathHint(path, fullResult?.files ?? [])
      } catch {
        // 查询失败不影响主流程
        pathHint = undefined
      }
    }

    const renderOptions = {
      nameOnly: nameOnlyParsed.value,
      nameStatus: nameStatusParsed.value,
      stat: statParsed.value,
      numstat: numstatParsed.value,
      patch: args.patch === undefined ? undefined : patchParsed.value,
    }

    let output = formatGitDiff(result, renderOptions)

    // 附加路径提示
    if (pathHint) {
      output = `No changes matched path "${path}".\n${pathHint}\n\n${output}`
    }
    if (parsedFormat.format === 'json') {
      return toolOkJson('git_diff', {
        format: 'json',
        diff: result,
        render: renderOptions,
      })
    }

    return toolOkJson('git_diff', {
      format: 'text',
      output,
      diff: result,
    })
  } catch (error) {
    return toolErrorJson(
      'git_diff',
      'internal_error',
      `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

//=============================================================================
// git_log - 查看提交历史
//=============================================================================

export const gitLogDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_log',
    description:
      'Show the commit history. Based on fs_changesets (snapshots) table.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of commits to show. Default: 10',
        },
        path: {
          type: 'string',
          description: 'Filter by path (only commits affecting this path)',
        },
        status: {
          type: 'string',
          enum: ['committed', 'approved', 'rolled_back'],
          description: 'Filter by snapshot status',
        },
        oneline: {
          type: 'boolean',
          description: 'Use compact one-line format. Default: false',
        },
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text',
        },
      },
    },
  },
}

export const gitLogExecutor: ToolExecutor = async (args, context) => {
  try {
    const projectId = ensureProjectId(context)
    if (!projectId) {
      return toolErrorJson('git_log', 'no_active_project', 'No active project')
    }
    if (args.limit !== undefined) {
      if (
        typeof args.limit !== 'number' ||
        !Number.isFinite(args.limit) ||
        args.limit <= 0 ||
        !Number.isInteger(args.limit)
      ) {
        return toolErrorJson('git_log', 'invalid_arguments', 'limit must be a positive integer')
      }
    }
    const limit = (args.limit as number) || 10
    const path = args.path as string | undefined
    const status = args.status as 'committed' | 'approved' | 'rolled_back' | undefined
    if (status && status !== 'committed' && status !== 'approved' && status !== 'rolled_back') {
      return toolErrorJson(
        'git_log',
        'invalid_arguments',
        'status must be one of: committed, approved, rolled_back'
      )
    }
    const oneline = args.oneline as boolean
    if (args.oneline !== undefined && typeof args.oneline !== 'boolean') {
      return toolErrorJson('git_log', 'invalid_arguments', 'oneline must be boolean')
    }
    const parsedFormat = parseFormat(args.format)
    if (!parsedFormat.ok) {
      return toolErrorJson('git_log', 'invalid_arguments', parsedFormat.error)
    }

    const result = await gitLog(projectId, {
      limit,
      path,
      status,
    })

    const output = oneline ? formatGitLogOneline(result) : formatGitLog(result)
    if (parsedFormat.format === 'json') {
      return toolOkJson('git_log', {
        format: 'json',
        log: result,
      })
    }

    return toolOkJson('git_log', {
      format: 'text',
      output,
      log: result,
      oneline: oneline === true,
    })
  } catch (error) {
    return toolErrorJson(
      'git_log',
      'internal_error',
      `Failed to get log: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

//=============================================================================
// git_show - 查看提交详情
//=============================================================================

export const gitShowDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_show',
    description:
      'Show detailed information about a commit (snapshot). Includes commit message and diffs.',
    parameters: {
      type: 'object',
      properties: {
        snapshot_id: {
          type: 'string',
          description: 'Snapshot ID to show. If omitted, shows the latest snapshot.',
        },
        include_diff: {
          type: 'boolean',
          description: 'Include unified diff for this snapshot. Default: false',
        },
        path: {
          type: 'string',
          description: 'Optional path prefix filter when include_diff=true',
        },
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text',
        },
      },
    },
  },
}

export const gitShowExecutor: ToolExecutor = async (args, context) => {
  try {
    const projectId = ensureProjectId(context)
    if (!projectId) {
      return toolErrorJson('git_show', 'no_active_project', 'No active project')
    }
    const snapshotId = args.snapshot_id as string | undefined
    if (args.include_diff !== undefined && typeof args.include_diff !== 'boolean') {
      return toolErrorJson('git_show', 'invalid_arguments', 'include_diff must be boolean')
    }
    const includeDiff = args.include_diff as boolean | undefined
    const path = args.path as string | undefined
    const parsedFormat = parseFormat(args.format)
    if (!parsedFormat.ok) {
      return toolErrorJson('git_show', 'invalid_arguments', parsedFormat.error)
    }

    const result = await gitShow(projectId, snapshotId, {
      includeDiff: includeDiff === true,
      path,
    })

    if (!result) {
      return toolErrorJson('git_show', 'not_found', 'No snapshots found')
    }

    const output = formatGitShow(result)
    if (parsedFormat.format === 'json') {
      return toolOkJson('git_show', {
        format: 'json',
        show: result,
      })
    }

    return toolOkJson('git_show', {
      format: 'text',
      output,
      show: result,
    })
  } catch (error) {
    return toolErrorJson(
      'git_show',
      'internal_error',
      `Failed to show commit: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

//=============================================================================
// git_restore - 恢复文件
//=============================================================================

export const gitRestoreDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_restore',
    description:
      'Restore working tree files. Can undo pending changes or restore from history snapshots. ' +
      'Use staged=true to unstage files (like git restore --staged).',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'File paths to restore (supports glob patterns like "src/*.ts"). If omitted or empty, apply to all eligible paths.',
        },
        staged: {
          type: 'boolean',
          description: 'Unstage files instead of restoring working tree (like --staged flag)',
        },
        snapshot_id: {
          type: 'string',
          description: 'Restore from specific snapshot. If omitted, restores from latest.',
        },
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text',
        },
      },
    },
  },
}

export const gitRestoreExecutor: ToolExecutor = async (args, context) => {
  try {
    const workspaceId = ensureWorkspaceId(context)
    if (!workspaceId) {
      return toolErrorJson('git_restore', 'no_active_workspace', 'No active workspace')
    }
    const rawPaths = args.paths
    const paths = Array.isArray(rawPaths) ? (rawPaths as string[]) : []
    const staged = args.staged as boolean
    const snapshotId = args.snapshot_id as string | undefined
    const parsedFormat = parseFormat(args.format)
    if (!parsedFormat.ok) {
      return toolErrorJson('git_restore', 'invalid_arguments', parsedFormat.error)
    }

    if (rawPaths !== undefined && !Array.isArray(rawPaths)) {
      return toolErrorJson('git_restore', 'invalid_arguments', 'paths must be an array of strings')
    }
    if (paths.some((path) => typeof path !== 'string' || !path)) {
      return toolErrorJson('git_restore', 'invalid_arguments', 'paths must be a string array')
    }
    if (args.staged !== undefined && typeof args.staged !== 'boolean') {
      return toolErrorJson('git_restore', 'invalid_arguments', 'staged must be boolean')
    }

    const result = await gitRestore(workspaceId, {
      paths,
      staged: staged || false,
      worktree: !staged,
      snapshotId,
      directoryHandle: null,
    })

    // 刷新状态
    await useConversationContextStore.getState().updateCurrentCounts()
    await useConversationContextStore.getState().refreshPendingChanges(true)

    const output = formatGitRestore(result)
    if (parsedFormat.format === 'json') {
      return toolOkJson('git_restore', {
        format: 'json',
        restore: result,
      })
    }

    return toolOkJson('git_restore', {
      format: 'text',
      output,
      restore: result,
    })
  } catch (error) {
    return toolErrorJson(
      'git_restore',
      'internal_error',
      `Failed to restore: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

export const gitPromptDoc: ToolPromptDoc = {
  category: 'git',
  section: '### Git Tools (Version Control)',
  lines: [
    '- `git_status(format?)` - Show the working tree status',
    '- `git_diff(mode?, path?, ...)` - Show changes between commits, commit and working tree, etc.',
    '- `git_log(limit?, path?, ...)` - Show the commit history',
    '- `git_show(snapshot_id?, ...)` - Show detailed info about a commit (snapshot)',
    '- `git_restore(paths?, staged?, snapshot_id?)` - Restore working tree files',
  ],
}
