/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Package Manager - Python package loading and dependency management
 *
 * Manages Python package loading in Pyodide with:
 * - Automatic import detection from code
 * - Parallel package loading with deduplication
 * - Loading state tracking to prevent duplicate loads
 * - Error handling for missing or failed packages
 */

import { PythonPackage, PYTHON_PACKAGES } from './constants'

//=============================================================================
// Package Manager Class
//=============================================================================

/**
 * Manages Python package loading for Pyodide
 *
 * Features:
 * - Tracks loaded and loading packages to prevent duplicates
 * - Detects required packages from import statements
 * - Loads packages in parallel when possible
 * - Provides clear error messages for missing packages
 *
 * @example
 * ```ts
 * const manager = new PackageManager(pyodide)
 * await manager.ensure(['pandas', 'numpy'])
 * ```
 */
export class PackageManager {
  private loaded = new Set<PythonPackage>()
  private loading = new Set<PythonPackage>()

  constructor(private pyodide: any) {}

  //=============================================================================
  // Public Methods
  //=============================================================================

  /**
   * Ensure multiple packages are loaded, loading any that are missing
   *
   * Skips already loaded packages and loads missing packages in parallel.
   * Tracks loading state to prevent duplicate loads.
   *
   * @param packages - Array of package names to load
   * @throws Error if package loading fails
   *
   * @example
   * ```ts
   * await manager.ensure(['pandas', 'numpy', 'matplotlib'])
   * ```
   */
  async ensure(packages: PythonPackage[]): Promise<void> {
    // Filter out already loaded packages
    const needToLoad = packages.filter((pkg) => !this.loaded.has(pkg))

    if (needToLoad.length === 0) {
      return
    }

    // Filter out packages that are currently being loaded
    const notLoading = needToLoad.filter((pkg) => !this.loading.has(pkg))

    if (notLoading.length === 0) {
      // All needed packages are already loading, wait for them
      await this.waitForLoading(needToLoad)
      return
    }

    // Mark packages as loading
    notLoading.forEach((pkg) => this.loading.add(pkg))

    try {
      // Load packages in parallel
      await Promise.all(notLoading.map((pkg) => this.loadOne(pkg)))

      // Mark as loaded
      notLoading.forEach((pkg) => {
        this.loaded.add(pkg)
        this.loading.delete(pkg)
      })
    } catch (error) {
      // Clean up loading state on error
      notLoading.forEach((pkg) => this.loading.delete(pkg))
      throw error
    }
  }

  /**
   * Load a single Python package
   *
   * Uses Pyodide's loadPackage API to download and install the package.
   * Packages are loaded from the Pyodide CDN.
   *
   * @param pkg - Package name to load
   * @throws Error if package is not available or loading fails
   *
   * @example
   * ```ts
   * await manager.loadOne('pandas')
   * ```
   */
  async loadOne(pkg: PythonPackage): Promise<void> {
    if (this.loaded.has(pkg)) {
      return
    }

    try {
      await this.pyodide.loadPackage(pkg)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load Python package '${pkg}': ${errorMsg}`)
    }
  }

  /**
   * Detect Python packages required by code
   *
   * Scans code for import statements and returns the packages that need to be loaded.
   * Supports both direct imports and from imports.
   *
   * @param code - Python code to scan
   * @returns Array of required package names
   *
   * @example
   * ```ts
   * const code = `
   * import pandas as pd
   * import numpy as np
   * from matplotlib import pyplot
   * `
   * const needed = manager.detectImports(code)
   * // Returns: ['pandas', 'numpy', 'matplotlib']
   * ```
   */
  detectImports(code: string): PythonPackage[] {
    const imports = new Set<PythonPackage>()

    // Match: import package, import package as alias, import package.submodule
    const importRegex = /import\s+([a-zA-Z_][a-zA-Z0-9_]*)/g
    let match

    while ((match = importRegex.exec(code)) !== null) {
      const pkg = match[1] as PythonPackage
      if (PYTHON_PACKAGES.includes(pkg)) {
        imports.add(pkg)
      }
    }

    // Match: from package import ...
    const fromRegex = /from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+import/g

    while ((match = fromRegex.exec(code)) !== null) {
      const pkg = match[1] as PythonPackage
      if (PYTHON_PACKAGES.includes(pkg)) {
        imports.add(pkg)
      }
    }

    return Array.from(imports)
  }

  //=============================================================================
  // Private Methods
  //=============================================================================

  /**
   * Wait for packages that are currently being loaded
   *
   * Polls the loading state until all requested packages are loaded.
   * Used when ensure() is called while packages are still loading.
   *
   * @param packages - Packages to wait for
   * @private
   */
  private async waitForLoading(packages: PythonPackage[]): Promise<void> {
    const startTime = Date.now()
    const timeout = 30000 // 30 seconds max wait

    while (Date.now() - startTime <= timeout) {
      // Check if all packages are loaded
      const allLoaded = packages.every((pkg) => this.loaded.has(pkg))

      if (allLoaded) {
        return
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    throw new Error(
      `Timeout waiting for packages to load: ${packages.filter((p) => !this.loaded.has(p)).join(', ')}`
    )
  }

  //=============================================================================
  // State Queries
  //=============================================================================

  /**
   * Check if a package is currently loaded
   */
  has(pkg: PythonPackage): boolean {
    return this.loaded.has(pkg)
  }

  /**
   * Get all currently loaded packages
   */
  getLoaded(): PythonPackage[] {
    return Array.from(this.loaded)
  }

  /**
   * Get all packages that are currently loading
   */
  getLoading(): PythonPackage[] {
    return Array.from(this.loading)
  }

  /**
   * Reset all package state (for testing)
   */
  reset(): void {
    this.loaded.clear()
    this.loading.clear()
  }
}
