/**
 * Git Merge Command
 *
 * Implements git merge functionality using isomorphic-git.
 * Supports branch merging, merge abort, and merge status.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type { GitMergeOptions, GitMergeResult, GitMergeStatus, GitResult } from '../types'

/**
 * Merge a branch into the current branch
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Merge options including target branch and merge strategy
 * @returns Result containing merge information
 */
export async function gitMerge(
  fs: GitFs,
  dir: string,
  options: GitMergeOptions
): Promise<GitResult<GitMergeResult>> {
  const startTime = Date.now()
  const { theirs, ours, commit = true, message, author, noFF = false, squash = false } = options

  try {
    // Validate target branch
    if (!theirs || theirs.trim() === '') {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'Target branch is required',
          code: 'MERGE_ERROR',
          exitCode: 128,
          stderr: 'Target branch cannot be empty',
        },
        duration: Date.now() - startTime,
      }
    }

    // Check if target branch exists
    const branches = await git.listBranches({ fs, dir })
    if (!branches.includes(theirs)) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Branch '${theirs}' does not exist`,
          code: 'MERGE_BRANCH_NOT_FOUND',
          exitCode: 128,
          stderr: `Branch '${theirs}' does not exist`,
        },
        duration: Date.now() - startTime,
      }
    }

    // Get current branch
    const currentBranchResult = await git.getCurrentBranch({ fs, dir })
    const currentBranch = currentBranchResult.replace('refs/heads/', '')

    // Check for uncommitted changes
    const status = await git.statusMatrix({ fs, dir })
    const hasUncommittedChanges = status.some(
      ([, staged, unstaged, workdir]: [string, number, number, number]) =>
        staged !== workdir || unstaged !== workdir
    )

    if (hasUncommittedChanges) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'You have uncommitted changes. Please commit or stash them before merging.',
          code: 'MERGE_UNCOMMITTED_CHANGES',
          exitCode: 128,
          stderr: 'Working directory has uncommitted changes',
        },
        duration: Date.now() - startTime,
      }
    }

    // Get commits to determine if fast-forward is possible
    const ourSha = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    const theirSha = await git.resolveRef({ fs, dir, ref: `refs/heads/${theirs}` })

    // Check if already merged
    const isMerged = await git.isMerged({
      fs,
      dir,
      ours: ourSha,
      theirs: theirSha,
    })

    if (isMerged) {
      return {
        success: true,
        data: {
          success: true,
          hasConflicts: false,
          fastForward: false,
          message: `Branch '${theirs}' is already merged`,
          sourceBranch: theirs,
          targetBranch: currentBranch,
        },
        duration: Date.now() - startTime,
      }
    }

    // Try to perform merge
    let mergeResult: {
      oid: string
      fastForward?: boolean
    }

    const authorObj = author
      ? { name: author.name, email: author.email, timestamp: Math.floor(Date.now() / 1000) }
      : { name: 'Unknown', email: 'unknown@example.com', timestamp: Math.floor(Date.now() / 1000) }

    const mergeMessage = message || `Merge branch '${theirs}' into ${currentBranch}`

    if (noFF) {
      // Force merge commit (no fast-forward)
      mergeResult = await git.merge({
        fs,
        dir,
        ours: 'HEAD',
        theirs: `refs/heads/${theirs}`,
        oursStrategy: ours
          ? { ours: await git.resolveRef({ fs, dir, ref: `refs/heads/${ours}` }) }
          : undefined,
        commit: commit && !squash,
        author: authorObj,
        message: mergeMessage,
      })
    } else if (squash) {
      // Squash merge
      mergeResult = await git.merge({
        fs,
        dir,
        ours: 'HEAD',
        theirs: `refs/heads/${theirs}`,
        commit: false,
        author: authorObj,
      })
    } else {
      // Standard merge (may fast-forward)
      mergeResult = await git.merge({
        fs,
        dir,
        ours: 'HEAD',
        theirs: `refs/heads/${theirs}`,
        commit: commit,
        author: authorObj,
        message: mergeMessage,
      })
    }

    // Check for conflicts
    const conflictStatus = await git.statusMatrix({ fs, dir })
    const conflictedFiles = conflictStatus
      .filter(([, , , workdir]: [string, number, number, number]) => workdir === 3) // 3 = unmerged
      .map(([path]: [string, number, number, number]) => path)

    if (conflictedFiles.length > 0) {
      // Write merge head for conflict detection
      const gitDir = `${dir}/.git`
      await fs.promises.writeFile(`${gitDir}/MERGE_HEAD`, `${theirSha}\n`, { flag: 'w' })
      await fs.promises.writeFile(
        `${gitDir}/MERGE_MSG`,
        `Merge branch '${theirs}' into ${currentBranch}\n`,
        { flag: 'w' }
      )

      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Merge has ${conflictedFiles.length} conflict(s)`,
          code: 'MERGE_CONFLICTS',
          exitCode: 1,
          stderr: `Conflicts in: ${conflictedFiles.join(', ')}`,
        },
        duration: Date.now() - startTime,
        data: {
          success: false,
          hasConflicts: true,
          conflicts: conflictedFiles,
          fastForward: mergeResult.fastForward,
          sourceBranch: theirs,
          targetBranch: currentBranch,
        },
      }
    }

    // Write merge head for completed merge
    const gitDir = `${dir}/.git`
    await fs.promises.writeFile(`${gitDir}/MERGE_HEAD`, `${theirSha}\n`, { flag: 'w' })

    return {
      success: true,
      data: {
        success: true,
        hasConflicts: false,
        fastForward: mergeResult.fastForward,
        commitSha: mergeResult.oid,
        shortSha: mergeResult.oid.substring(0, 7),
        message: mergeMessage,
        sourceBranch: theirs,
        targetBranch: currentBranch,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check for conflict errors
    if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
      try {
        const conflictStatus = await git.statusMatrix({ fs, dir })
        const conflictedFiles = conflictStatus
          .filter(([, , , workdir]: [string, number, number, number]) => workdir === 3)
          .map(([path]: [string, number, number, number]) => path)

        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Merge conflicts in ${conflictedFiles.length} file(s)`,
            code: 'MERGE_CONFLICTS',
            exitCode: 1,
            stderr: errorMessage,
          },
          duration: Date.now() - startTime,
          data: {
            success: false,
            hasConflicts: true,
            conflicts: conflictedFiles,
            sourceBranch: theirs,
            targetBranch: '',
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
        message: `Failed to merge branch '${theirs}': ${errorMessage}`,
        code: 'MERGE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Abort a merge in progress
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns Result indicating abort success
 */
export async function gitMergeAbort(
  fs: GitFs,
  dir: string
): Promise<GitResult<{ aborted: boolean }>> {
  const startTime = Date.now()

  try {
    // Check if merge is in progress
    const isMerging = await gitIsMerging(fs, dir)

    if (!isMerging) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'No merge in progress',
          code: 'MERGE_NOT_IN_PROGRESS',
          exitCode: 128,
          stderr: 'There is no merge to abort',
        },
        duration: Date.now() - startTime,
      }
    }

    // Remove MERGE_HEAD, MERGE_MSG, and other merge-related files
    const gitDir = `${dir}/.git`

    try {
      await fs.promises.unlink(`${gitDir}/MERGE_HEAD`)
    } catch {
      // MERGE_HEAD may not exist
    }

    try {
      await fs.promises.unlink(`${gitDir}/MERGE_MSG`)
    } catch {
      // MERGE_MSG may not exist
    }

    try {
      await fs.promises.unlink(`${gitDir}/MERGE_MODE`)
    } catch {
      // MERGE_MODE may not exist
    }

    try {
      await fs.promises.unlink(`${gitDir}/CHERRY_PICK_HEAD`)
    } catch {
      // CHERRY_PICK_HEAD may not exist
    }

    // Reset index to HEAD (discard merge conflicts)
    try {
      const headSha = await git.resolveRef({ fs, dir, ref: 'HEAD' })

      await git.resetIndex({
        fs,
        dir,
        ref: headSha,
      })
    } catch {
      // Reset may fail if there are no changes, which is fine
    }

    return {
      success: true,
      data: {
        aborted: true,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to abort merge: ${errorMessage}`,
        code: 'MERGE_ABORT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Get the current merge status
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns Result containing merge status information
 */
export async function gitMergeStatus(fs: GitFs, dir: string): Promise<GitResult<GitMergeStatus>> {
  const startTime = Date.now()

  try {
    // Check for MERGE_HEAD file
    const gitDir = `${dir}/.git`
    let mergeHead: string | undefined
    let isMerging = false

    try {
      const mergeHeadContent = await fs.promises.readFile(`${gitDir}/MERGE_HEAD`, {
        encoding: 'utf8',
      })
      const content = typeof mergeHeadContent === 'string' ? mergeHeadContent.trim() : ''
      if (content.length > 0) {
        mergeHead = content
        isMerging = true
      }
    } catch {
      // MERGE_HEAD doesn't exist
      isMerging = false
    }

    // Get merge message
    let lastMessage: string | undefined
    try {
      const mergeMsgContent = await fs.promises.readFile(`${gitDir}/MERGE_MSG`, {
        encoding: 'utf8',
      })
      lastMessage = typeof mergeMsgContent === 'string' ? mergeMsgContent.trim() : undefined
    } catch {
      // MERGE_MSG doesn't exist
    }

    // Check for conflicted files
    const conflictStatus = await git.statusMatrix({ fs, dir })
    const conflictedFiles = conflictStatus
      .filter(([, , , workdir]: [string, number, number, number]) => workdir === 3) // 3 = unmerged
      .map(([path]: [string, number, number, number]) => path)

    // Check if merge was aborted
    let aborted = false
    if (!isMerging && conflictedFiles.length === 0) {
      try {
        await fs.promises.readFile(`${gitDir}/MERGE_HEAD`)
        // MERGE_HEAD exists but we couldn't read it, may be aborted
      } catch {
        aborted = true
      }
    }

    return {
      success: true,
      data: {
        isMerging,
        mergeHead,
        conflicts: conflictedFiles,
        conflictCount: conflictedFiles.length,
        aborted: aborted || (conflictedFiles.length === 0 && !isMerging),
        lastMessage,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get merge status: ${errorMessage}`,
        code: 'MERGE_STATUS_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Check if a merge is in progress
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns True if a merge is in progress
 */
export async function gitIsMerging(fs: GitFs, dir: string): Promise<boolean> {
  try {
    const gitDir = `${dir}/.git`

    // Check for MERGE_HEAD file
    try {
      const mergeHeadContent = await fs.promises.readFile(`${gitDir}/MERGE_HEAD`, {
        encoding: 'utf8',
      })
      const content = typeof mergeHeadContent === 'string' ? mergeHeadContent.trim() : ''
      if (content.length > 0) {
        return true
      }
    } catch {
      // MERGE_HEAD doesn't exist
    }

    // Check for unmerged files in status
    const conflictStatus = await git.statusMatrix({ fs, dir })
    const hasUnmergedFiles = conflictStatus.some(
      ([, , , workdir]: [string, number, number, number]) => workdir === 3
    )

    if (hasUnmergedFiles) {
      return true
    }

    // Check for CHERRY_PICK_HEAD (revert in progress)
    try {
      await fs.promises.readFile(`${gitDir}/CHERRY_PICK_HEAD`)
      return true
    } catch {
      // CHERRY_PICK_HEAD doesn't exist
    }

    return false
  } catch {
    return false
  }
}

/**
 * Squash merge - merge a branch into the current branch as a single commit
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param options Squash merge options
 * @returns Result containing squash merge information
 */
export async function gitSquashMerge(
  fs: GitFs,
  dir: string,
  options: GitMergeOptions
): Promise<GitResult<GitMergeResult>> {
  const { theirs, message } = options

  // Perform merge with squash option
  return gitMerge(fs, dir, {
    ...options,
    squash: true,
    commit: true,
    message: message || `Squash merge of '${theirs}'`,
  })
}

/**
 * Merge with rebase - rebase current branch onto target branch then merge
 * Note: isomorphic-git doesn't have native rebase, this is a placeholder
 * @param _fs Filesystem instance compatible with isomorphic-git
 * @param _dir Repository directory
 * @param options Rebase merge options
 * @returns Result indicating rebase merge is not supported
 */
export async function gitRebaseMerge(
  _fs: GitFs,
  _dir: string,
  options: GitMergeOptions
): Promise<GitResult<GitMergeResult>> {
  const startTime = Date.now()
  const { theirs } = options

  return {
    success: false,
    error: {
      name: 'GitError',
      message: 'Rebase merge is not supported in browser environment',
      code: 'REBASE_NOT_SUPPORTED',
      exitCode: 128,
      stderr: 'Rebase requires shell access which is not available in browser',
    },
    duration: Date.now() - startTime,
    data: {
      success: false,
      hasConflicts: false,
      sourceBranch: theirs,
    },
  }
}

/**
 * Get the commits that would be merged
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @param theirs Target branch to merge
 * @returns Result containing commits that would be merged
 */
export async function gitMergeBase(
  fs: GitFs,
  dir: string,
  theirs: string
): Promise<GitResult<{ oid: string; message: string; author: string }[]>> {
  const startTime = Date.now()

  try {
    // Validate target branch
    const branches = await git.listBranches({ fs, dir })
    if (!branches.includes(theirs)) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Branch '${theirs}' does not exist`,
          code: 'BRANCH_NOT_FOUND',
          exitCode: 128,
          stderr: `Branch '${theirs}' does not exist`,
        },
        duration: Date.now() - startTime,
      }
    }

    // Get our current SHA
    const ourSha = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    const theirSha = await git.resolveRef({ fs, dir, ref: `refs/heads/${theirs}` })

    // Get commits that differ
    const ourCommits = new Set<string>()
    const theirCommits = new Set<string>()

    // Get our commits since merge base
    const mergeBaseSha = await git.mergeBase({
      fs,
      dir,
      ours: ourSha,
      theirs: theirSha,
    })

    // Collect our commits
    let sha = ourSha
    while (sha !== mergeBaseSha) {
      ourCommits.add(sha)
      try {
        const commit = await git.readCommit({ fs, dir, oid: sha })
        sha = commit.commit.parent[0]
      } catch {
        break
      }
    }

    // Collect their commits
    sha = theirSha
    while (sha !== mergeBaseSha) {
      theirCommits.add(sha)
      try {
        const commit = await git.readCommit({ fs, dir, oid: sha })
        sha = commit.commit.parent[0]
      } catch {
        break
      }
    }

    // Format commits
    const commits = Array.from(theirCommits)
      .reverse()
      .map((oid) => {
        const commit = git.readCommitSync({ fs, dir, oid })
        return {
          oid,
          shortOid: oid.substring(0, 7),
          message: commit?.commit?.message || '',
          author: commit?.commit?.author?.name || '',
          timestamp: commit?.commit?.author?.timestamp || 0,
        }
      })

    return {
      success: true,
      data: commits,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get merge base: ${errorMessage}`,
        code: 'MERGE_BASE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
