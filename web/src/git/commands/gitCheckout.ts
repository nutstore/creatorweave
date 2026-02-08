/**
 * Git Checkout Command
 *
 * Implements git checkout and restore functionality using isomorphic-git.
 * Provides branch switching, file restoration, and change discarding.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitResult } from '../types'

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

/**
 * Checkout a branch or file
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Checkout options
 * @returns Result containing checkout information
 */
export async function gitCheckout(
  fs: GitFs,
  dir: string,
  options: GitCheckoutOptions
): Promise<GitResult<GitCheckoutResult>> {
  const startTime = Date.now()
  const { branch, filepath, createBranch = false, force = false, source } = options

  try {
    // Branch checkout
    if (branch) {
      const branchRef = `refs/heads/${branch}`

      // Check if branch exists
      const branches = await git.listBranches({ fs, dir })
      const branchExists = branches.includes(branch)

      if (!branchExists && !createBranch) {
        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Branch '${branch}' does not exist`,
            code: 'BRANCH_NOT_FOUND',
            exitCode: 128,
            stderr: `Branch '${branch}' does not exist`,
          },
          duration: Date.now() - startTime,
        }
      }

      // Create branch if requested and doesn't exist
      if (!branchExists && createBranch) {
        await git.branch({
          fs,
          dir,
          ref: branchRef,
          checkout: false,
        })
      }

      // Update HEAD
      const headPath = `${dir}/.git/HEAD`
      const headContent = `ref: ${branchRef}\n`
      await fs.promises.writeFile(headPath, headContent, { flag: 'w' })

      return {
        success: true,
        data: {
          type: 'branch',
          branch,
          forced: force,
        },
        duration: Date.now() - startTime,
      }
    }

    // File checkout
    if (filepath) {
      await git.checkout({
        fs,
        dir,
        filepath,
        ref: source || 'HEAD',
      })

      return {
        success: true,
        data: {
          type: 'file',
          filepath,
        },
        duration: Date.now() - startTime,
      }
    }

    return {
      success: false,
      error: {
        name: 'GitError',
        message: 'Either branch or filepath must be provided',
        code: 'CHECKOUT_MISSING_ARGUMENT',
        exitCode: 128,
        stderr: 'Either branch or filepath must be provided',
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to checkout: ${errorMessage}`,
        code: 'CHECKOUT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Switch to a branch safely (semantic wrapper for gitCheckout)
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Switch options
 * @returns Result containing switch information
 */
export async function gitSwitch(
  fs: GitFs,
  dir: string,
  options: GitSwitchOptions
): Promise<GitResult<GitCheckoutResult>> {
  const { branch, createBranch = false, discardChanges = false } = options

  // Get current branch
  const currentBranch = await git.getCurrentBranch({ fs, dir })
  const currentBranchName = currentBranch?.replace('refs/heads/', '')

  // Check if already on target branch
  if (currentBranchName === branch) {
    return {
      success: true,
      data: {
        type: 'branch',
        branch,
      },
      duration: 0,
    }
  }

  // Check for uncommitted changes if not discarding
  if (!discardChanges) {
    const statusMatrix = await git.statusMatrix({ fs, dir })
    const hasUncommittedChanges = statusMatrix.some(
      ([, head, workdir, stage]: [string, number, number, number]) =>
        workdir !== stage || head === 0
    )

    if (hasUncommittedChanges) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Cannot switch to branch '${branch}': You have uncommitted changes. Commit, stash, or discard them first.`,
          code: 'UNCOMMITTED_CHANGES',
          exitCode: 128,
          stderr: `Cannot switch to branch '${branch}': You have uncommitted changes`,
        },
        duration: 0,
      }
    }
  }

  return gitCheckout(fs, dir, {
    branch,
    createBranch,
    force: discardChanges,
  })
}

/**
 * Discard changes to files (git checkout -- <file>)
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Discard options
 * @returns Result containing discarded files
 */
export async function gitDiscardChanges(
  fs: GitFs,
  dir: string,
  options: GitDiscardChangesOptions
): Promise<GitResult<GitDiscardChangesResult>> {
  const startTime = Date.now()
  const { filepaths, discardStaged = false } = options

  const discarded: string[] = []
  const errors: Array<{ filepath: string; error: string }> = []

  for (const filepath of filepaths) {
    try {
      if (discardStaged) {
        // Discard both staged and working tree changes
        await git.checkout({
          fs,
          dir,
          filepath,
          ref: 'HEAD',
        })
      } else {
        // Just discard working tree changes (restore from index)
        // This is done by reading from HEAD and writing to workdir
        const blob = await git
          .readBlob({
            fs,
            dir,
            oid: await git.resolveRef({ fs, dir, ref: 'HEAD' }),
            filepath,
          })
          .catch(() => null)

        if (blob) {
          // File exists in HEAD, restore it
          await git.checkout({
            fs,
            dir,
            filepath,
            ref: 'HEAD',
          })
        } else {
          // File doesn't exist in HEAD, remove it from workdir
          await fs.promises.unlink(`${dir}/${filepath}`)
        }
      }
      discarded.push(filepath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ filepath, error: errorMessage })
    }
  }

  if (errors.length > 0 && discarded.length === 0) {
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to discard changes for any file`,
        code: 'DISCARD_CHANGES_ERROR',
        exitCode: 128,
        stderr: errors.map((e) => `${e.filepath}: ${e.error}`).join(', '),
      },
      duration: Date.now() - startTime,
    }
  }

  return {
    success: true,
    data: { discarded, errors },
    duration: Date.now() - startTime,
  }
}

/**
 * Restore files to a specific state
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Restore options
 * @returns Result containing restore information
 */
export async function gitRestore(
  fs: GitFs,
  dir: string,
  options: GitRestoreOptions
): Promise<GitResult<GitRestoreResult>> {
  const startTime = Date.now()
  const { filepath, source = 'HEAD', staging = 'working-tree' } = options

  try {
    // Determine the ref to restore from
    let ref = source
    if (source === 'staged') {
      // Restore from staging area (index)
      ref = 'HEAD'
    } else if (source === 'working-tree') {
      // This doesn't make sense for restore, default to HEAD
      ref = 'HEAD'
    } else if (source.startsWith('origin/') || source.startsWith('refs/')) {
      ref = source
    }

    // Perform the restore based on staging option
    if (staging === 'staged' || staging === 'both') {
      // Reset the index to match the source
      await git.resetIndex({
        fs,
        dir,
        filepath,
        ref,
      })
    }

    if (staging === 'working-tree' || staging === 'both') {
      // Checkout the file from the source
      await git.checkout({
        fs,
        dir,
        filepath,
        ref,
      })
    }

    return {
      success: true,
      data: {
        filepath,
        source: ref,
        staging,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to restore file "${filepath}": ${errorMessage}`,
        code: 'RESTORE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Discard all working directory changes
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing operation status
 */
export async function gitDiscardAllChanges(
  fs: GitFs,
  dir: string
): Promise<GitResult<GitDiscardChangesResult>> {
  const startTime = Date.now()

  try {
    const statusMatrix = await git.statusMatrix({ fs, dir })
    const filepaths: string[] = []

    for (const [filepath, head, workdir, stage] of statusMatrix) {
      // Skip unchanged files and untracked files
      if (head !== 0 && workdir !== stage) {
        filepaths.push(filepath)
      }
    }

    const result = await gitDiscardChanges(fs, dir, {
      filepaths,
      discardStaged: true,
    })

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to discard all changes: ${errorMessage}`,
        code: 'DISCARD_ALL_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Reset working directory to match a commit
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param commitRef Commit SHA or branch to reset to
 * @returns Result containing reset information
 */
export async function gitResetWorkingDir(
  fs: GitFs,
  dir: string,
  commitRef: string
): Promise<GitResult<{ reset: boolean; commit: string }>> {
  const startTime = Date.now()

  try {
    // Resolve the commit reference
    const commitSha = await git.resolveRef({ fs, dir, ref: commitRef })

    // Get list of files to reset
    const statusMatrix = await git.statusMatrix({ fs, dir })

    // Reset and checkout each changed file
    for (const entry of statusMatrix) {
      const filepath = entry[0]
      const workdir = entry[2]
      const stage = entry[3]
      if (workdir !== stage) {
        await git.checkout({
          fs,
          dir,
          filepath,
          ref: commitSha,
        })
      }
    }

    return {
      success: true,
      data: {
        reset: true,
        commit: commitSha,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to reset working directory: ${errorMessage}`,
        code: 'RESET_WORKING_DIR_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
