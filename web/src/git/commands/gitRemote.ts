/**
 * Git Remote Command
 *
 * Implements git remote operations using isomorphic-git.
 * Supports fetching, pushing, and pulling from remote repositories.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitResult } from '../types'

/**
 * Status matrix entry type from isomorphic-git
 */
type StatusMatrixEntry = [filepath: string, head: number, workdir: number, stage: number]

/**
 * Options for gitFetch operation
 */
export interface GitFetchOptions {
  /** Remote name or URL (default: 'origin') */
  remote?: string
  /** Branch to fetch (fetches all if not specified) */
  branch?: string
  /** Fetch tags */
  tags?: boolean
  /** Fetch all remotes */
  all?: boolean
  /** Prune stale remote-tracking references */
  prune?: boolean
  /** Depth for shallow fetch */
  depth?: number
}

/**
 * Result of gitFetch operation
 */
export interface GitFetchResult {
  /** Whether fetch was successful */
  success: boolean
  /** Fetched refs */
  fetched: string[]
  /** Pruned refs (if prune was enabled) */
  pruned?: string[]
  /** Any errors that occurred */
  errors: Array<{ ref?: string; error: string }>
}

/**
 * Options for gitPush operation
 */
export interface GitPushOptions {
  /** Remote name or URL (default: 'origin') */
  remote?: string
  /** Branch to push (default: current branch) */
  branch?: string
  /** Force push */
  force?: boolean
  /** Push tags */
  tags?: boolean
  /** Push all branches */
  all?: boolean
  /** Delete remote branch after push */
  delete?: boolean
  /** Set upstream tracking */
  setUpstream?: boolean
}

/**
 * Result of gitPush operation
 */
export interface GitPushResult {
  /** Whether push was successful */
  success: boolean
  /** Pushed refs */
  pushed: string[]
  /** Any errors that occurred */
  errors: Array<{ ref?: string; error: string }>
}

/**
 * Options for gitPull operation
 */
export interface GitPullOptions {
  /** Remote name or URL (default: 'origin') */
  remote?: string
  /** Branch to pull from (default: upstream of current branch) */
  branch?: string
  /** Rebase instead of merge */
  rebase?: boolean
  /** Commit message for merge commit */
  message?: string
  /** Author for the commit */
  author?: { name: string; email: string }
}

/**
 * Result of gitPull operation
 */
export interface GitPullResult {
  /** Whether pull was successful */
  success: boolean
  /** Whether this was a fast-forward */
  fastForward?: boolean
  /** Whether there were conflicts */
  hasConflicts: boolean
  /** Conflicted files (if any) */
  conflicts?: string[]
  /** Updated branches */
  updates: Array<{ branch: string; from: string; to: string }>
  /** Commit SHA if merge/rebase created a commit */
  commitSha?: string
}

/**
 * Fetch changes from a remote repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Fetch options
 * @returns Result containing fetch information
 */
export async function gitFetch(
  fs: GitFs,
  dir: string,
  options: GitFetchOptions = {}
): Promise<GitResult<GitFetchResult>> {
  const startTime = Date.now()
  const { remote = 'origin', branch, tags = false, all = false, prune = false, depth } = options

  try {
    const fetchedRefs: string[] = []
    const prunedRefs: string[] = []
    const errors: Array<{ ref?: string; error: string }> = []

    // Perform the fetch
    const fetchResult = await git.fetch({
      fs,
      dir,
      remote,
      ref: branch,
      tags,
      all,
      prune,
      depth,
      onAuth: () => {
        // For browser environment, we'll try anonymous access first
        // Authentication would be handled by the caller if needed
        return { username: 'anonymous', password: '' }
      },
    })

    // Collect fetched refs from the result
    if (fetchResult && fetchResult.fetchedRefs) {
      for (const ref of fetchResult.fetchedRefs) {
        fetchedRefs.push(ref)
      }
    }

    // Collect pruned refs if prune was enabled
    if (prune && fetchResult && fetchResult.prunedRefs) {
      for (const ref of fetchResult.prunedRefs) {
        prunedRefs.push(ref)
      }
    }

    return {
      success: true,
      data: {
        success: true,
        fetched: fetchedRefs,
        pruned: prunedRefs.length > 0 ? prunedRefs : undefined,
        errors,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle authentication errors specially
    if (errorMessage.includes('auth') || errorMessage.includes('authentication')) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Authentication failed for remote '${remote}': ${errorMessage}`,
          code: 'FETCH_AUTH_ERROR',
          exitCode: 128,
          stderr: errorMessage,
        },
        duration: Date.now() - startTime,
      }
    }

    // Handle remote not found
    if (errorMessage.includes('not found') || errorMessage.includes('Could not resolve')) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Remote '${remote}' not found: ${errorMessage}`,
          code: 'FETCH_REMOTE_NOT_FOUND',
          exitCode: 128,
          stderr: errorMessage,
        },
        duration: Date.now() - startTime,
      }
    }

    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to fetch from '${remote}': ${errorMessage}`,
        code: 'FETCH_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Push changes to a remote repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Push options
 * @returns Result containing push information
 */
export async function gitPush(
  fs: GitFs,
  dir: string,
  options: GitPushOptions = {}
): Promise<GitResult<GitPushResult>> {
  const startTime = Date.now()
  const {
    remote = 'origin',
    branch: branchOption,
    force = false,
    tags = false,
    all = false,
    delete: deleteBranch = false,
    setUpstream = false,
  } = options

  try {
    const pushedRefs: string[] = []
    const errors: Array<{ ref?: string; error: string }> = []

    // Get current branch if not specified
    let branch = branchOption
    if (!branch) {
      const currentBranch = await git.getCurrentBranch({ fs, dir })
      if (currentBranch) {
        branch = currentBranch.replace('refs/heads/', '')
      }
    }

    if (!branch) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'No branch specified and no current branch found',
          code: 'PUSH_NO_BRANCH',
          exitCode: 128,
          stderr: 'No branch to push',
        },
        duration: Date.now() - startTime,
      }
    }

    // Delete remote branch if requested
    if (deleteBranch) {
      await git.push({
        fs,
        dir,
        remote,
        ref: `refs/heads/${branch}`,
        delete: true,
        force,
        onAuth: () => ({ username: 'anonymous', password: '' }),
      })

      return {
        success: true,
        data: {
          success: true,
          pushed: [`refs/heads/${branch}`],
          errors: [],
        },
        duration: Date.now() - startTime,
      }
    }

    // Push all branches
    if (all) {
      const branches = await git.listBranches({ fs, dir })
      for (const br of branches) {
        try {
          await git.push({
            fs,
            dir,
            remote,
            ref: `refs/heads/${br}`,
            force,
            onAuth: () => ({ username: 'anonymous', password: '' }),
          })
          pushedRefs.push(`refs/heads/${br}`)
        } catch (err) {
          errors.push({
            ref: `refs/heads/${br}`,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    } else {
      // Push single branch
      await git.push({
        fs,
        dir,
        remote,
        ref: `refs/heads/${branch}`,
        force,
        setUpstream,
        onAuth: () => ({ username: 'anonymous', password: '' }),
      })
      pushedRefs.push(`refs/heads/${branch}`)
    }

    // Push tags if requested
    if (tags) {
      try {
        await git.push({
          fs,
          dir,
          remote,
          ref: 'refs/tags/*',
          force: false,
          onAuth: () => ({ username: 'anonymous', password: '' }),
        })
        pushedRefs.push('refs/tags/*')
      } catch (err) {
        errors.push({
          ref: 'tags',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    // Check if push was successful
    const hasErrors = errors.length > 0
    const success = pushedRefs.length > 0 && !hasErrors

    return {
      success,
      data: {
        success,
        pushed: pushedRefs,
        errors,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('authentication')) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Authentication failed for remote '${remote}': ${errorMessage}`,
          code: 'PUSH_AUTH_ERROR',
          exitCode: 128,
          stderr: errorMessage,
        },
        duration: Date.now() - startTime,
      }
    }

    // Handle rejected updates (non-fast-forward)
    if (
      errorMessage.includes('non-fast-forward') ||
      errorMessage.includes('Updates were rejected')
    ) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Push was rejected. The remote branch has new commits. Try pulling first or use --force.`,
          code: 'PUSH_REJECTED',
          exitCode: 128,
          stderr: errorMessage,
        },
        duration: Date.now() - startTime,
      }
    }

    // Handle remote not found
    if (errorMessage.includes('not found') || errorMessage.includes('Could not resolve')) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Remote '${remote}' not found: ${errorMessage}`,
          code: 'PUSH_REMOTE_NOT_FOUND',
          exitCode: 128,
          stderr: errorMessage,
        },
        duration: Date.now() - startTime,
      }
    }

    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to push to '${remote}': ${errorMessage}`,
        code: 'PUSH_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Pull changes from a remote repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Pull options
 * @returns Result containing pull information
 */
export async function gitPull(
  fs: GitFs,
  dir: string,
  options: GitPullOptions = {}
): Promise<GitResult<GitPullResult>> {
  const startTime = Date.now()
  const { remote = 'origin', branch: branchOption, rebase = false, message, author } = options

  try {
    // Get current branch
    const currentBranch = await git.getCurrentBranch({ fs, dir })
    if (!currentBranch) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'No current branch. Cannot pull.',
          code: 'PULL_NO_BRANCH',
          exitCode: 128,
          stderr: 'No current branch',
        },
        duration: Date.now() - startTime,
      }
    }

    const branchName = currentBranch.replace('refs/heads/', '')
    const targetBranch = branchOption || branchName

    // Fetch first
    const fetchResult = await git.fetch({
      fs,
      dir,
      remote,
      ref: targetBranch,
      onAuth: () => ({ username: 'anonymous', password: '' }),
    })

    if (!fetchResult) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Failed to fetch from '${remote}'`,
          code: 'PULL_FETCH_FAILED',
          exitCode: 128,
          stderr: 'Fetch failed',
        },
        duration: Date.now() - startTime,
      }
    }

    // Get the remote commit SHA
    let remoteSha: string
    try {
      remoteSha = await git.resolveRef({
        fs,
        dir,
        ref: `refs/remotes/${remote}/${targetBranch}`,
      })
    } catch {
      // Try with just the branch name if the remote branch doesn't exist
      try {
        remoteSha = await git.resolveRef({
          fs,
          dir,
          ref: `refs/heads/${targetBranch}`,
        })
      } catch {
        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Branch '${targetBranch}' not found on remote '${remote}'`,
            code: 'PULL_BRANCH_NOT_FOUND',
            exitCode: 128,
            stderr: 'Remote branch not found',
          },
          duration: Date.now() - startTime,
        }
      }
    }

    // Get our current commit SHA
    const ourSha = await git.resolveRef({ fs, dir, ref: 'HEAD' })

    // Check if we can fast-forward
    const canFastForward = await git.isContained({
      fs,
      dir,
      oid: ourSha,
      ref: `refs/remotes/${remote}/${targetBranch}`,
    })

    // Perform the pull
    let fastForward = false
    let commitSha: string | undefined
    let conflicts: string[] | undefined

    if (canFastForward && !rebase) {
      // Fast-forward merge
      fastForward = true
      const mergeResult = await git.merge({
        fs,
        dir,
        ours: ourSha,
        theirs: `refs/remotes/${remote}/${targetBranch}`,
        commit: true,
        author: author
          ? { ...author, timestamp: Math.floor(Date.now() / 1000) }
          : {
              name: 'Unknown',
              email: 'unknown@example.com',
              timestamp: Math.floor(Date.now() / 1000),
            },
        message: message || `Merge branch '${remote}/${targetBranch}' into ${branchName}`,
      })
      commitSha = mergeResult.oid
    } else if (rebase) {
      // Note: Rebase is not fully supported in browser environment with isomorphic-git
      // Fall back to merge
      const mergeResult = await git.merge({
        fs,
        dir,
        ours: ourSha,
        theirs: `refs/remotes/${remote}/${targetBranch}`,
        commit: true,
        author: author
          ? { ...author, timestamp: Math.floor(Date.now() / 1000) }
          : {
              name: 'Unknown',
              email: 'unknown@example.com',
              timestamp: Math.floor(Date.now() / 1000),
            },
        message: message || `Merge branch '${remote}/${targetBranch}' into ${branchName}`,
      })
      commitSha = mergeResult.oid
    } else {
      // Regular merge (not fast-forward)
      const mergeResult = await git.merge({
        fs,
        dir,
        ours: ourSha,
        theirs: `refs/remotes/${remote}/${targetBranch}`,
        commit: true,
        author: author
          ? { ...author, timestamp: Math.floor(Date.now() / 1000) }
          : {
              name: 'Unknown',
              email: 'unknown@example.com',
              timestamp: Math.floor(Date.now() / 1000),
            },
        message: message || `Merge branch '${remote}/${targetBranch}' into ${branchName}`,
      })
      commitSha = mergeResult.oid
    }

    // Check for conflicts
    const statusMatrix = await git.statusMatrix({ fs, dir })
    const conflictedFiles = statusMatrix
      .filter((entry: StatusMatrixEntry) => entry[3] === 3)
      .map((entry: StatusMatrixEntry) => entry[0])

    if (conflictedFiles.length > 0) {
      conflicts = conflictedFiles

      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Pull has ${conflictedFiles.length} conflict(s)`,
          code: 'PULL_CONFLICTS',
          exitCode: 1,
          stderr: `Conflicts in: ${conflictedFiles.join(', ')}`,
        },
        duration: Date.now() - startTime,
        data: {
          success: false,
          hasConflicts: true,
          conflicts,
          fastForward,
          updates: [
            {
              branch: targetBranch,
              from: ourSha.substring(0, 7),
              to: remoteSha.substring(0, 7),
            },
          ],
        },
      }
    }

    return {
      success: true,
      data: {
        success: true,
        hasConflicts: false,
        fastForward,
        commitSha,
        updates: [
          {
            branch: targetBranch,
            from: ourSha.substring(0, 7),
            to: remoteSha.substring(0, 7),
          },
        ],
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle conflict errors
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      try {
        const statusMatrix = await git.statusMatrix({ fs, dir })
        const conflictedFiles = statusMatrix
          .filter((entry: StatusMatrixEntry) => entry[3] === 3)
          .map((entry: StatusMatrixEntry) => entry[0])

        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Pull has ${conflictedFiles.length} conflict(s): ${errorMessage}`,
            code: 'PULL_CONFLICTS',
            exitCode: 1,
            stderr: errorMessage,
          },
          duration: Date.now() - startTime,
          data: {
            success: false,
            hasConflicts: true,
            conflicts: conflictedFiles,
            updates: [],
          },
        }
      } catch {
        // Fall through to general error
      }
    }

    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to pull from '${remote}': ${errorMessage}`,
        code: 'PULL_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get list of configured remotes
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns Result containing list of remotes
 */
export async function gitRemoteList(
  fs: GitFs,
  dir: string
): Promise<GitResult<Array<{ name: string; url: string }>>> {
  const startTime = Date.now()

  try {
    const remotes = await git.listRemotes({ fs, dir })

    return {
      success: true,
      data: remotes,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to list remotes: ${errorMessage}`,
        code: 'REMOTE_LIST_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Add a remote repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param name Remote name
 * @param url Remote URL
 * @returns Result indicating success
 */
export async function gitRemoteAdd(
  fs: GitFs,
  dir: string,
  name: string,
  url: string
): Promise<GitResult<{ name: string; url: string }>> {
  const startTime = Date.now()

  try {
    await git.addRemote({ fs, dir, remote: name, url })

    return {
      success: true,
      data: { name, url },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to add remote '${name}': ${errorMessage}`,
        code: 'REMOTE_ADD_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Remove a remote repository
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param name Remote name to remove
 * @returns Result indicating success
 */
export async function gitRemoteRemove(
  fs: GitFs,
  dir: string,
  name: string
): Promise<GitResult<{ name: string }>> {
  const startTime = Date.now()

  try {
    await git.deleteRemote({ fs, dir, remote: name })

    return {
      success: true,
      data: { name },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to remove remote '${name}': ${errorMessage}`,
        code: 'REMOTE_REMOVE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
