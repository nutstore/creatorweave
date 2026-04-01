/**
 * Git Tools - OPFS 版本 Git 基础工具
 *
 * 提供浏览器版本的 Git 命令，基于现有的变更追踪和快照系统实现。
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getSQLiteDB } from '@/sqlite'
import { useConversationContextStore } from '@/store/conversation-context.store'

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

export const gitStatusExecutor: ToolExecutor = async (args) => {
  try {
    const db = getSQLiteDB()
    const result = await gitStatus(db)
    const format = args.format as string || 'text'

    if (format === 'json') {
      return JSON.stringify(result, null, 2)
    }

    return formatGitStatus(result)
  } catch (error) {
    return JSON.stringify({
      error: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
    })
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
        path: {
          type: 'string',
          description: 'Filter by path prefix',
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

export const gitDiffExecutor: ToolExecutor = async (args) => {
  try {
    const db = getSQLiteDB()
    const mode = (args.mode as 'working' | 'cached' | 'snapshot') || 'working'
    const snapshotId = args.snapshot_id as string | undefined
    const path = args.path as string | undefined
    const format = args.format as string || 'text'

    const result = await gitDiff(db, {
      mode,
      snapshotId,
      path,
    })

    if (format === 'json') {
      return JSON.stringify(result, null, 2)
    }

    return formatGitDiff(result)
  } catch (error) {
    return JSON.stringify({
      error: `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
    })
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

export const gitLogExecutor: ToolExecutor = async (args) => {
  try {
    const db = getSQLiteDB()
    const limit = (args.limit as number) || 10
    const path = args.path as string | undefined
    const status = args.status as 'committed' | 'approved' | 'rolled_back' | undefined
    const oneline = args.oneline as boolean
    const format = args.format as string || 'text'

    const result = await gitLog(db, {
      limit,
      path,
      status,
    })

    if (format === 'json') {
      return JSON.stringify(result, null, 2)
    }

    return oneline ? formatGitLogOneline(result) : formatGitLog(result)
  } catch (error) {
    return JSON.stringify({
      error: `Failed to get log: ${error instanceof Error ? error.message : String(error)}`,
    })
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
        format: {
          type: 'string',
          enum: ['json', 'text'],
          description: 'Output format. Default: text',
        },
      },
    },
  },
}

export const gitShowExecutor: ToolExecutor = async (args) => {
  try {
    const db = getSQLiteDB()
    const snapshotId = args.snapshot_id as string | undefined
    const format = args.format as string || 'text'

    const result = await gitShow(db, snapshotId)

    if (!result) {
      return JSON.stringify({ error: 'No snapshots found' })
    }

    if (format === 'json') {
      return JSON.stringify(result, null, 2)
    }

    return formatGitShow(result)
  } catch (error) {
    return JSON.stringify({
      error: `Failed to show commit: ${error instanceof Error ? error.message : String(error)}`,
    })
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
          description: 'File paths to restore (supports glob patterns like "src/*.ts")',
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
      required: ['paths'],
    },
  },
}

export const gitRestoreExecutor: ToolExecutor = async (args) => {
  try {
    const db = getSQLiteDB()
    const paths = args.paths as string[]
    const staged = args.staged as boolean
    const snapshotId = args.snapshot_id as string | undefined
    const format = args.format as string || 'text'

    if (!paths || paths.length === 0) {
      return JSON.stringify({ error: 'paths is required' })
    }

    const result = await gitRestore(db, {
      paths,
      staged: staged || false,
      worktree: !staged,
      snapshotId,
    })

    // 刷新状态
    await useConversationContextStore.getState().updateCurrentCounts()
    await useConversationContextStore.getState().refreshPendingChanges(true)

    if (format === 'json') {
      return JSON.stringify(result, null, 2)
    }

    return formatGitRestore(result)
  } catch (error) {
    return JSON.stringify({
      error: `Failed to restore: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
