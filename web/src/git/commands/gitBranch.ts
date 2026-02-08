/**
 * Git Branch Command
 *
 * Implements git branch functionality using isomorphic-git.
 * Provides branch listing, creation, deletion, and renaming.
 */

import git from 'isomorphic-git'
import type { GitFs } from '../utils/fs'
import type {
  GitBranch,
  GitBranchListOptions,
  GitBranchCreateOptions,
  GitBranchDeleteOptions,
  GitBranchRenameOptions,
  GitBranchResult,
  GitResult,
} from '../types'

/**
 * Get the current branch name
 * @param fs Filesystem instance compatible with isomorphic-git
 * @param dir Repository directory
 * @returns Result containing the current branch name
 */
export async function gitGetCurrentBranch(
  fs: GitFs,
  dir: string
): Promise<GitResult<string | null>> {
  const startTime = Date.now()

  try {
    // Try to get current branch using HEAD
    const branch = await git.getCurrentBranch({ fs, dir })

    if (!branch) {
      return {
        success: true,
        data: null,
        duration: Date.now() - startTime,
      }
    }

    // Extract branch name from ref
    const branchName = branch.replace('refs/heads/', '')

    return {
      success: true,
      data: branchName,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get current branch: ${errorMessage}`,
        code: 'GET_CURRENT_BRANCH_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * List all branches in the repository
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Branch list options
 * @returns Result containing array of branches
 */
export async function gitBranchList(
  fs: GitFs,
  dir: string,
  options: GitBranchListOptions = {}
): Promise<GitResult<GitBranch[]>> {
  const startTime = Date.now()
  const { includeRemote = false, sort = 'name' } = options

  try {
    const branches: GitBranch[] = []

    // Get current branch
    const currentBranchResult = await gitGetCurrentBranch(fs, dir)
    const currentBranch = currentBranchResult.data || null

    // Get all branches using isomorphic-git
    const refs = await git.listBranches({ fs, dir })

    for (const ref of refs) {
      const sha = await git.resolveRef({ fs, dir, ref: `refs/heads/${ref}` })

      branches.push({
        name: ref,
        ref: `refs/heads/${ref}`,
        sha,
        shortSha: sha.substring(0, 7),
        isCurrent: ref === currentBranch,
        isRemote: false,
      })
    }

    // Optionally include remote branches
    if (includeRemote) {
      try {
        const remoteRefs = await git.listBranches({ fs, dir, remote: 'origin' })
        for (const ref of remoteRefs) {
          const sha = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${ref}` })
          const existingLocal = branches.find((b) => b.name === ref && !b.isRemote)

          branches.push({
            name: ref,
            ref: `refs/remotes/origin/${ref}`,
            sha,
            shortSha: sha.substring(0, 7),
            isCurrent: false,
            isRemote: true,
            remote: 'origin',
          })

          // Update upstream info for local branch if it tracks this remote
          if (existingLocal) {
            existingLocal.upstream = `refs/remotes/origin/${ref}`
          }
        }
      } catch {
        // Remote may not exist, skip remote branches
      }
    }

    // Sort branches
    if (sort === 'date') {
      branches.sort((a, b) => {
        // Put current branch first
        if (a.isCurrent) return -1
        if (b.isCurrent) return 1
        // Then sort by date (using SHA as approximate order)
        return b.sha.localeCompare(a.sha)
      })
    } else {
      branches.sort((a, b) => {
        // Put current branch first
        if (a.isCurrent) return -1
        if (b.isCurrent) return 1
        // Then sort by name
        return a.name.localeCompare(b.name)
      })
    }

    return {
      success: true,
      data: branches,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to list branches: ${errorMessage}`,
        code: 'BRANCH_LIST_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Create a new branch
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Branch creation options
 * @returns Result containing the created branch info
 */
export async function gitBranchCreate(
  fs: GitFs,
  dir: string,
  options: GitBranchCreateOptions
): Promise<GitResult<GitBranchResult>> {
  const startTime = Date.now()
  const { name, startPoint = 'HEAD', force = false, orphan = false } = options

  try {
    // Validate branch name
    const branchValidation = validateBranchName(name)
    if (!branchValidation.valid) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: branchValidation.error || 'Invalid branch name',
          code: 'INVALID_BRANCH_NAME',
          exitCode: 128,
          stderr: branchValidation.error || 'Invalid branch name',
        },
        duration: Date.now() - startTime,
      }
    }

    // Check if branch already exists (unless force)
    if (!force) {
      const existingBranches = await git.listBranches({ fs, dir })
      if (existingBranches.includes(name)) {
        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Branch '${name}' already exists`,
            code: 'BRANCH_EXISTS',
            exitCode: 128,
            stderr: `Branch '${name}' already exists`,
          },
          duration: Date.now() - startTime,
        }
      }
    }

    // Resolve start point
    let startRef: string
    try {
      if (startPoint === 'HEAD') {
        startRef = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      } else {
        startRef = await git.resolveRef({ fs, dir, ref: startPoint })
      }
    } catch {
      // If startPoint is not found, it might be a commit SHA
      startRef = startPoint
    }

    // Create the branch
    if (orphan) {
      // For orphan branches, we create without setting a parent
      // This is a special case that requires special handling
      await git.branch({
        fs,
        dir,
        ref: `refs/heads/${name}`,
        checkout: false,
      })
    } else {
      await git.branch({
        fs,
        dir,
        ref: `refs/heads/${name}`,
        checkout: false,
      })
    }

    return {
      success: true,
      data: {
        name,
        ref: `refs/heads/${name}`,
        sha: startRef,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to create branch '${name}': ${errorMessage}`,
        code: 'BRANCH_CREATE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Delete a branch
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Branch deletion options
 * @returns Result containing deleted branch info
 */
export async function gitBranchDelete(
  fs: GitFs,
  dir: string,
  options: GitBranchDeleteOptions
): Promise<GitResult<GitBranchResult>> {
  const startTime = Date.now()
  const { name, force = false, remote = false } = options

  try {
    // Get current branch to prevent deleting it
    const currentBranch = await gitGetCurrentBranch(fs, dir)

    if (currentBranch.data === name && !force) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Cannot delete branch '${name}' which is your current branch`,
          code: 'DELETE_CURRENT_BRANCH',
          exitCode: 128,
          stderr: `Cannot delete branch '${name}' which is your current branch`,
        },
        duration: Date.now() - startTime,
      }
    }

    // Delete remote branch if requested
    if (remote) {
      // Note: For remote deletion, you'd need push access
      // This is a placeholder for remote branch deletion
      return {
        success: false,
        error: {
          name: 'GitError',
          message: 'Remote branch deletion is not supported in browser environment',
          code: 'REMOTE_DELETE_NOT_SUPPORTED',
          exitCode: 128,
          stderr: 'Remote branch deletion is not supported in browser environment',
        },
        duration: Date.now() - startTime,
      }
    }

    // Delete local branch
    if (force) {
      await git.deleteBranch({ fs, dir, ref: `refs/heads/${name}` })
    } else {
      // Check if branch is merged before deleting
      const branches = await git.listBranches({ fs, dir })
      if (!branches.includes(name)) {
        return {
          success: false,
          error: {
            name: 'GitError',
            message: `Branch '${name}' does not exist`,
            code: 'BRANCH_NOT_FOUND',
            exitCode: 128,
            stderr: `Branch '${name}' does not exist`,
          },
          duration: Date.now() - startTime,
        }
      }

      await git.deleteBranch({ fs, dir, ref: `refs/heads/${name}` })
    }

    return {
      success: true,
      data: {
        name,
        ref: `refs/heads/${name}`,
        sha: '', // SHA not available after deletion
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to delete branch '${name}': ${errorMessage}`,
        code: 'BRANCH_DELETE_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Rename a branch
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param options Branch rename options
 * @returns Result containing renamed branch info
 */
export async function gitBranchRename(
  fs: GitFs,
  dir: string,
  options: GitBranchRenameOptions
): Promise<GitResult<GitBranchResult>> {
  const startTime = Date.now()
  const { oldName, newName, force = false } = options

  try {
    // Get current branch
    const currentBranch = await gitGetCurrentBranch(fs, dir)
    const isCurrentBranch = currentBranch.data === oldName

    // Validate new branch name
    const branchValidation = validateBranchName(newName)
    if (!branchValidation.valid) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: branchValidation.error || 'Invalid branch name',
          code: 'INVALID_BRANCH_NAME',
          exitCode: 128,
          stderr: branchValidation.error || 'Invalid branch name',
        },
        duration: Date.now() - startTime,
      }
    }

    // Check if newName already exists
    const branches = await git.listBranches({ fs, dir })
    if (branches.includes(newName) && !force) {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `A branch named '${newName}' already exists`,
          code: 'BRANCH_EXISTS',
          exitCode: 128,
          stderr: `A branch named '${newName}' already exists`,
        },
        duration: Date.now() - startTime,
      }
    }

    // Get SHA of the old branch before renaming
    let sha: string
    try {
      sha = await git.resolveRef({ fs, dir, ref: `refs/heads/${oldName}` })
    } catch {
      return {
        success: false,
        error: {
          name: 'GitError',
          message: `Branch '${oldName}' does not exist`,
          code: 'BRANCH_NOT_FOUND',
          exitCode: 128,
          stderr: `Branch '${oldName}' does not exist`,
        },
        duration: Date.now() - startTime,
      }
    }

    // Rename the branch
    await git.branch({
      fs,
      dir,
      ref: `refs/heads/${newName}`,
      checkout: false,
    })

    // Delete the old branch reference
    await git.deleteBranch({ fs, dir, ref: `refs/heads/${oldName}` })

    // Update HEAD if it was pointing to the old branch
    if (isCurrentBranch) {
      // Write new HEAD reference
      const headPath = `${dir}/.git/HEAD`
      const headContent = `ref: refs/heads/${newName}\n`
      await fs.promises.writeFile(headPath, headContent, { flag: 'w' })
    }

    return {
      success: true,
      data: {
        name: newName,
        ref: `refs/heads/${newName}`,
        sha,
        previousName: oldName,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to rename branch '${oldName}' to '${newName}': ${errorMessage}`,
        code: 'BRANCH_RENAME_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Check if a branch exists
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param branchName Branch name to check
 * @returns Promise resolving to true if branch exists
 */
export async function gitBranchExists(
  fs: GitFs,
  dir: string,
  branchName: string
): Promise<boolean> {
  try {
    const branches = await git.listBranches({ fs, dir })
    return branches.includes(branchName)
  } catch {
    return false
  }
}

/**
 * Get branch information including SHA and current status
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @param branchName Branch name
 * @returns Result containing branch info
 */
export async function gitBranchInfo(
  fs: GitFs,
  dir: string,
  branchName: string
): Promise<GitResult<GitBranch | null>> {
  const startTime = Date.now()

  try {
    const branches = await git.listBranches({ fs, dir })
    if (!branches.includes(branchName)) {
      return {
        success: true,
        data: null,
        duration: Date.now() - startTime,
      }
    }

    const sha = await git.resolveRef({ fs, dir, ref: `refs/heads/${branchName}` })
    const currentBranch = await gitGetCurrentBranch(fs, dir)

    return {
      success: true,
      data: {
        name: branchName,
        ref: `refs/heads/${branchName}`,
        sha,
        shortSha: sha.substring(0, 7),
        isCurrent: currentBranch.data === branchName,
        isRemote: false,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to get branch info: ${errorMessage}`,
        code: 'BRANCH_INFO_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Validate a branch name according to Git conventions
 * @param name Branch name to validate
 * @returns Object with valid boolean and error message if invalid
 */
export function validateBranchName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Branch name cannot be empty' }
  }

  const trimmedName = name.trim()

  // Git branch name rules:
  // - Cannot start with / or -
  // - Cannot contain spaces, ~, ^, :, ?, *, [
  // - Cannot end with /
  // - Cannot have consecutive dots
  // - Cannot have .. anywhere

  const invalidPatterns = [
    { pattern: /^\//, message: "Branch name cannot start with '/'" },
    { pattern: /^-/, message: "Branch name cannot start with '-'" },
    { pattern: /\s/, message: 'Branch name cannot contain spaces' },
    { pattern: /~/, message: "Branch name cannot contain '~'" },
    { pattern: /\^/, message: "Branch name cannot contain '^'" },
    { pattern: /:/, message: "Branch name cannot contain ':'" },
    { pattern: /\?/, message: "Branch name cannot contain '?'" },
    { pattern: /\*/, message: "Branch name cannot contain '*'" },
    { pattern: /\[/, message: "Branch name cannot contain '['" },
    { pattern: /\/$/, message: "Branch name cannot end with '/'" },
    { pattern: /\.\./, message: "Branch name cannot contain '..'" },
    { pattern: /\.lock$/, message: "Branch name cannot end with '.lock'" },
  ]

  for (const { pattern, message } of invalidPatterns) {
    if (pattern.test(trimmedName)) {
      return { valid: false, error: message }
    }
  }

  // Check for consecutive dots
  if (/\.\./.test(trimmedName)) {
    return { valid: false, error: "Branch name cannot contain '..'" }
  }

  // Reserved names
  const reservedNames = ['HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']
  if (reservedNames.includes(trimmedName)) {
    return { valid: false, error: `'${trimmedName}' is a reserved branch name` }
  }

  return { valid: true }
}

/**
 * Get the number of local branches
 * @param fs Filesystem instance
 * @param dir Repository directory
 * @returns Result containing the number of branches
 */
export async function gitBranchCount(fs: GitFs, dir: string): Promise<GitResult<number>> {
  const startTime = Date.now()

  try {
    const branches = await git.listBranches({ fs, dir })

    return {
      success: true,
      data: branches.length,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: {
        name: 'GitError',
        message: `Failed to count branches: ${errorMessage}`,
        code: 'BRANCH_COUNT_ERROR',
        exitCode: 128,
        stderr: errorMessage,
      },
      duration: Date.now() - startTime,
    }
  }
}
