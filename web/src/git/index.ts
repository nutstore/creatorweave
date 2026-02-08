/**
 * Git Module
 *
 * Browser-compatible Git operations using isomorphic-git.
 *
 * This module provides:
 * - Type definitions for Git operations
 * - Filesystem abstraction using LightningFS
 * - Commands: log, status, diff, commit, branch
 *
 * Usage:
 * ```typescript
 * import { initGitFs, gitLog, gitStatus, gitDiff, gitCommit, gitBranchList, gitGetCurrentBranch } from './git'
 *
 * // Initialize the filesystem
 * const fs = await initGitFs()
 *
 * // Perform Git operations
 * const logResult = await gitLog(fs, '/path/to/repo')
 * const statusResult = await gitStatus(fs, '/path/to/repo')
 * const diffResult = await gitDiff(fs, '/path/to/repo')
 * const commitResult = await gitCommit(fs, '/path/to/repo', { message: 'feat: new feature' })
 * const branchListResult = await gitBranchList(fs, '/path/to/repo')
 * const currentBranch = await gitGetCurrentBranch(fs, '/path/to/repo')
 * ```
 */

// Types
export type {
  GitCommit,
  GitStatus,
  GitStatusEntry,
  GitStatusType,
  GitStatusOptions,
  GitDiff,
  GitDiffEntry,
  GitDiffHunk,
  GitDiffLine,
  GitDiffOptions,
  GitLogOptions,
  GitInitOptions,
  GitConfigEntry,
  GitBlob,
  GitTreeEntry,
  GitRef,
  GitError,
  GitResult,
  GitAddOptions,
  GitAddResult,
  GitCommitOptions,
  GitCommitResult,
  GitBranch,
  GitBranchListOptions,
  GitBranchCreateOptions,
  GitBranchDeleteOptions,
  GitBranchRenameOptions,
  GitBranchResult,
  GitCheckoutOptions,
  GitCheckoutResult,
  GitSwitchOptions,
  GitDiscardChangesOptions,
  GitDiscardChangesResult,
  GitRestoreOptions,
  GitRestoreResult,
  GitMergeOptions,
  GitMergeResult,
  GitMergeStatus,
} from './types'

// Utils
export {
  getLightningFS,
  initBuffer,
  getBuffer,
  createGitFs,
  getGitFs,
  initGitFs,
  resetGitFs,
  isGitRepository,
  initGitRepository,
  getGitDir,
} from './utils'

export type { GitFs } from './utils/fs'

// Commands
export { gitLog, gitLogLatest, gitLogCount, gitLogFormatted } from './commands/gitLog'
export { gitStatus, gitStatusPorcelain, gitHasChanges, gitStatusShort } from './commands/gitStatus'
export {
  gitDiff,
  gitDiffCached,
  gitDiffText,
  gitDiffStats,
  gitHasUncommittedChanges,
} from './commands/gitDiff'
export {
  gitAdd,
  gitAddAll,
  gitAddPattern,
  gitRemove,
  gitReset,
  gitResetFiles,
} from './commands/gitAdd'
export {
  gitCommit,
  gitCommitAmend,
  gitCommitWithSignature,
  gitInitialCommit,
} from './commands/gitCommit'
export {
  gitGetCurrentBranch,
  gitBranchList,
  gitBranchCreate,
  gitBranchDelete,
  gitBranchRename,
  gitBranchExists,
  gitBranchInfo,
  gitBranchCount,
  validateBranchName,
} from './commands/gitBranch'
export {
  gitCheckout,
  gitSwitch,
  gitDiscardChanges,
  gitDiscardAllChanges,
  gitRestore,
  gitResetWorkingDir,
} from './commands/gitCheckout'
export {
  gitMerge,
  gitMergeAbort,
  gitMergeStatus,
  gitIsMerging,
  gitSquashMerge,
  gitRebaseMerge,
  gitMergeBase,
} from './commands/gitMerge'
