/**
 * Git Module Type Definitions
 *
 * Type definitions for Git operations using isomorphic-git in the browser.
 */

/**
 * Git commit information
 */
export interface GitCommit {
  /** Commit hash (full SHA) */
  oid: string
  /** Abbreviated commit hash (7 characters) */
  shortOid: string
  /** Commit message */
  message: string
  /** Commit author name */
  authorName: string
  /** Commit author email */
  authorEmail: string
  /** Author timestamp in milliseconds */
  authorTimestamp: number
  /** Committer name */
  committerName: string
  /** Committer email */
  committerEmail: string
  /** Committer timestamp in milliseconds */
  committerTimestamp: number
  /** Parent commit hashes */
  parent: string[]
  /** Tree hash */
  tree: string
  /** GPG signature (if present) */
  signature?: string
}

/**
 * Git status entry for a single file
 */
export interface GitStatusEntry {
  /** File path relative to repository root */
  path: string
  /** File status classification */
  status: GitStatusType
  /** Staged changes indicator */
  staged: boolean
  /** Unstaged changes indicator */
  unstaged: boolean
  /** Untracked indicator */
  untracked: boolean
  /** Rename/copy similarity score (0-100) if applicable */
  score?: number
  /** Previous path if renamed/copied */
  oldPath?: string
}

/**
 * Git file status types
 */
export type GitStatusType =
  /** Not modified */
  | 'unmodified'
  /** Modified in working directory */
  | 'modified'
  /** Added to staging area */
  | 'added'
  /** Deleted from working directory */
  | 'deleted'
  /** Renamed in working directory */
  | 'renamed'
  /** Copied in working directory */
  | 'copied'
  /** Untracked file */
  | 'untracked'
  /** Type change (e.g., regular file to symlink) */
  | 'typechange'
  /** Unmerged (conflicts) */
  | 'unmerged'

/**
 * Git repository status summary
 */
export interface GitStatus {
  /** Current branch name */
  currentBranch: string
  /** Whether repository is bare */
  isBare: boolean
  /** Whether repository is empty (no commits) */
  isEmpty: boolean
  /** All file status entries */
  entries: GitStatusEntry[]
  /** Number of staged files */
  stagedCount: number
  /** Number of unstaged files */
  unstagedCount: number
  /** Number of untracked files */
  untrackedCount: number
  /** Whether there are any conflicts */
  hasConflicts: boolean
  /** Current HEAD commit (if exists) */
  currentCommit?: string
  /** Current HEAD tree (if exists) */
  currentTree?: string
}

/**
 * Git diff entry for a single file
 */
export interface GitDiffEntry {
  /** File path */
  path: string
  /** Previous path if renamed */
  oldPath?: string
  /** Whether this is a binary file */
  isBinary: boolean
  /** New file mode (e.g., '100644', '100755', '040000') */
  newMode?: string
  /** Previous file mode */
  oldMode?: string
  /** New file blob hash */
  newBlob?: string
  /** Previous file blob hash */
  oldBlob?: string
  /** Number of additions */
  additions: number
  /** Number of deletions */
  deletions: number
  /** Hunks of changes */
  hunks: GitDiffHunk[]
}

/**
 * A single hunk in a diff
 */
export interface GitDiffHunk {
  /** Old file starting line number */
  oldStart: number
  /** Old file line count */
  oldLines: number
  /** New file starting line number */
  newStart: number
  /** New file line count */
  newLines: number
  /** Header showing function/context */
  header: string
  /** Lines of the hunk */
  lines: GitDiffLine[]
}

/**
 * A single line in a diff hunk
 */
export interface GitDiffLine {
  /** Line type: 'context', 'addition', or 'deletion' */
  type: 'context' | 'addition' | 'deletion'
  /** Line content (without trailing newline) */
  content: string
  /** Line number in old file (if applicable) */
  oldLineNumber?: number
  /** Line number in new file (if applicable) */
  newLineNumber?: number
}

/**
 * Complete diff result for one or more files
 */
export interface GitDiff {
  /** Array of diff entries */
  entries: GitDiffEntry[]
  /** Total additions across all files */
  totalAdditions: number
  /** Total deletions across all files */
  totalDeletions: number
  /** Whether any files are binary */
  hasBinary: boolean
}

/**
 * Git log options
 */
export interface GitLogOptions {
  /** Maximum number of commits to return (0 for all) */
  depth?: number
  /** Skip commits from the start */
  skip?: number
  /** Include commit hashes in results */
  includeHash?: boolean
  /** Include file statistics */
  includeStats?: boolean
  /** Include body/description (not just first line of message) */
  includeBody?: boolean
  /** Reverse commit order (oldest first) */
  reverse?: boolean
}

/**
 * Git status options
 */
export interface GitStatusOptions {
  /** Show all files (including unchanged) */
  showAll?: boolean
  /** Only show staged changes */
  showStaged?: boolean
  /** Only show unstaged changes */
  showUnstaged?: boolean
  /** Only show untracked files */
  showUntracked?: boolean
  /** Format as porcelain (machine-readable) */
  porcelain?: boolean
  /** Include similarity scores for renames/copies */
  similarity?: boolean
}

/**
 * Git diff options
 */
export interface GitDiffOptions {
  /** Compare against this commit (default: HEAD) */
  ref?: string
  /** Compare against this commit for old version */
  oldRef?: string
  /** File path to filter (optional) */
  path?: string
  /** Include binary files */
  includeBinary?: boolean
  /** Include file stats */
  includeStats?: boolean
  /** Context lines around changes */
  contextLines?: number
  /** Detect renames/copies */
  detectRenames?: boolean
  /** Renaming similarity threshold (0-100) */
  renameThreshold?: number
  /** Copy detection */
  detectCopies?: boolean
}

/**
 * Git repository initialization options
 */
export interface GitInitOptions {
  /** Repository bare status */
  bare?: boolean
  /** Default branch name */
  defaultBranch?: string
  /** Whether to make it a bare repository */
  noCheckout?: boolean
}

/**
 * Git configuration entry
 */
export interface GitConfigEntry {
  /** Configuration key */
  key: string
  /** Configuration value */
  value: string
  /** Configuration scope (local, global, system) */
  scope?: 'local' | 'global' | 'system'
}

/**
 * Git blob content (file content at a specific commit/tree)
 */
export interface GitBlob {
  /** Blob hash (SHA) */
  oid: string
  /** Blob size in bytes */
  size: number
  /** Content as Uint8Array */
  content: Uint8Array
  /** Content as text (if text file) */
  text?: string
}

/**
 * Git tree entry
 */
export interface GitTreeEntry {
  /** Entry name (filename) */
  name: string
  /** Entry path */
  path: string
  /** Tree entry mode */
  mode: string
  /** Object hash */
  oid: string
  /** Object type ('blob' | 'tree') */
  type: 'blob' | 'tree'
  /** File size (for blobs) */
  size?: number
}

/**
 * Git reference (branch/tag)
 */
export interface GitRef {
  /** Reference name (e.g., 'refs/heads/main') */
  name: string
  /** Shorthand name */
  shortName: string
  /** Reference type ('branch' | 'tag' | 'remote') */
  type: 'branch' | 'tag' | 'remote'
  /** Target commit hash */
  oid: string
  /** Is HEAD reference */
  isHead?: boolean
  /** Is current branch */
  isCurrent?: boolean
  /** Remote name (if remote branch) */
  remote?: string
}

/**
 * Error class for Git operations
 */
export class GitError extends Error {
  /** Error code for programmatic handling */
  code: string
  /** Optional: command that failed */
  command?: string
  /** Optional: exit code */
  exitCode?: number
  /** Optional: stderr output */
  stderr?: string

  constructor(message: string, code: string, command?: string, exitCode?: number, stderr?: string) {
    super(message)
    this.name = 'GitError'
    this.code = code
    this.command = command
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

/**
 * Result of a Git operation
 */
export interface GitResult<T> {
  /** Whether operation succeeded */
  success: boolean
  /** Result data (if successful) */
  data?: T
  /** Error (if failed) */
  error?: GitError
  /** Execution time in milliseconds */
  duration?: number
}

/**
 * Options for gitAdd operation
 */
export interface GitAddOptions {
  /** File path to add (relative to repository root) */
  filepath: string
  /** Optional directory (if filepath is relative) */
  dir?: string
}

/**
 * Result of gitAdd operation
 */
export interface GitAddResult {
  /** Array of successfully added files */
  added: string[]
  /** Array of errors for files that failed to add */
  errors: Array<{ filepath: string; error: string }>
}

/**
 * Options for gitCommit operation
 */
export interface GitCommitOptions {
  /** Commit message (required) */
  message: string
  /** Author name (optional, will use git config if not provided) */
  author?: { name: string; email: string }
  /** Optional file paths to commit (commits all staged files if not provided) */
  filepaths?: string[]
  /** Parent commit SHA (for amending or specific parent) */
  parent?: string
  /** GPG signing key ID (if GPG signing is enabled) */
  signingKey?: string
}

/**
 * Result of gitCommit operation
 */
export interface GitCommitResult {
  /** Commit hash (full SHA) */
  sha: string
  /** Abbreviated commit hash (7 characters) */
  shortSha: string
  /** Commit message */
  message: string
  /** Author information */
  author: { name: string; email: string; timestamp: number }
  /** Committer information */
  committer: { name: string; email: string; timestamp: number }
  /** Tree hash */
  tree: string
  /** Parent commit hashes */
  parents: string[]
  /** GPG signature (if present) */
  signature?: string
}

/**
 * Git branch information
 */
export interface GitBranch {
  /** Branch name (e.g., 'main', 'feature/new-feature') */
  name: string
  /** Full reference name (e.g., 'refs/heads/main') */
  ref: string
  /** Commit SHA that the branch points to */
  sha: string
  /** Abbreviated commit SHA (7 characters) */
  shortSha: string
  /** Whether this is the current branch (HEAD) */
  isCurrent: boolean
  /** Whether this is a remote branch */
  isRemote: boolean
  /** Remote name (if remote branch) */
  remote?: string
  /** Upstream branch (if tracking a remote branch) */
  upstream?: string
  /** Whether the branch is ahead of upstream */
  ahead?: number
  /** Whether the branch is behind upstream */
  behind?: number
  /** Whether the branch has local commits not pushed */
  hasLocalCommits?: boolean
}

/**
 * Git branch list options
 */
export interface GitBranchListOptions {
  /** Include remote branches */
  includeRemote?: boolean
  /** Include current branch info */
  includeCurrent?: boolean
  /** Sort order: 'name' | 'date' */
  sort?: 'name' | 'date'
}

/**
 * Git branch create options
 */
export interface GitBranchCreateOptions {
  /** Branch name to create */
  name: string
  /** Starting point (branch name, tag, or commit SHA) */
  startPoint?: string
  /** Force creation even if branch exists */
  force?: boolean
  /** Create orphan branch (no parent) */
  orphan?: boolean
}

/**
 * Git branch delete options
 */
export interface GitBranchDeleteOptions {
  /** Branch name to delete */
  name: string
  /** Force delete even if branch is not fully merged */
  force?: boolean
  /** Delete remote branch if set */
  remote?: boolean
  /** Remote name (if deleting remote branch) */
  remoteName?: string
}

/**
 * Git branch rename options
 */
export interface GitBranchRenameOptions {
  /** Current branch name */
  oldName: string
  /** New branch name */
  newName: string
  /** Force rename even if newName branch exists */
  force?: boolean
}

/**
 * Result of gitBranch operation
 */
export interface GitBranchResult {
  /** Branch name */
  name: string
  /** Full reference */
  ref: string
  /** Commit SHA */
  sha: string
  /** Previous name (for rename) */
  previousName?: string
}

/**
 * Options for gitCheckout operation
 */
export interface GitCheckoutOptions {
  /** Branch to checkout (required for branch checkout) */
  branch?: string
  /** File path to checkout (required for file checkout) */
  filepath?: string
  /** Create branch if it doesn't exist */
  createBranch?: boolean
  /** Force checkout (discard local changes) */
  force?: boolean
  /** Source commit/branch to restore from (for file checkout) */
  source?: string
}

/**
 * Result of gitCheckout operation
 */
export interface GitCheckoutResult {
  /** Type of checkout performed */
  type: 'branch' | 'file'
  /** Branch name (if branch checkout) */
  branch?: string
  /** File path (if file checkout) */
  filepath?: string
  /** Whether checkout was forced */
  forced?: boolean
}

/**
 * Options for gitSwitch operation (safer branch switching)
 */
export interface GitSwitchOptions {
  /** Branch to switch to */
  branch: string
  /** Create branch if it doesn't exist */
  createBranch?: boolean
  /** Discard local changes when switching */
  discardChanges?: boolean
}

/**
 * Options for gitDiscardChanges operation
 */
export interface GitDiscardChangesOptions {
  /** File paths to discard changes for */
  filepaths: string[]
  /** Also discard staged changes */
  discardStaged?: boolean
}

/**
 * Options for gitRestore operation
 */
export interface GitRestoreOptions {
  /** File path to restore */
  filepath: string
  /** Source to restore from: branch, commit SHA, or staging area */
  source?: string
  /** What to restore: 'staged', 'working-tree', or 'both' */
  staging?: 'staged' | 'working-tree' | 'both'
}

/**
 * Result of gitDiscardChanges operation
 */
export interface GitDiscardChangesResult {
  /** Files that were discarded */
  discarded: string[]
  /** Files that failed to discard */
  errors: Array<{ filepath: string; error: string }>
}

/**
 * Result of gitRestore operation
 */
export interface GitRestoreResult {
  /** File path that was restored */
  filepath: string
  /** Source it was restored from */
  source: string
  /** What was restored */
  staging: 'staged' | 'working-tree' | 'both'
}
