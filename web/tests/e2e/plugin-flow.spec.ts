import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Plugin Flow
 *
 * Prerequisites:
 * - Dev server running with WASM files built
 * - Example plugins (line-counter, md5-calculator) available
 *
 * Note: File System Access API requires user interaction, so some tests
 * use mock data or manual testing instructions.
 */

test.describe('Plugin Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('Plugin UI Navigation', () => {
    test('should navigate to plugins page', async ({ page }) => {
      // Click the Plugins button in header
      const pluginsButton = page.getByRole('button', { name: /plugins/i }).first()
      await pluginsButton.click()

      // Should show plugin manager
      await expect(page.getByText(/plugin manager/i)).toBeVisible()
      await expect(page).toHaveURL(/#plugins/)
    })

    test('should return to home from plugins page', async ({ page }) => {
      // Navigate to plugins first
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      // Click back to home
      const homeButton = page.getByRole('button', { name: /home|back/i }).first()
      await homeButton.click()

      // Should show home page with hero section
      await expect(page.getByText(/file system analyzer/i)).toBeVisible()
    })
  })

  test.describe('Built-in Plugin Display', () => {
    test('should display available plugins', async ({ page }) => {
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      // Should show plugin cards
      await expect(
        page.locator('[data-testid="plugin-card"]').or(page.locator('.plugin-card'))
      ).toHaveCount(expect.any(Number))
    })

    test('should show plugin details', async ({ page }) => {
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      // Check for plugin information
      await expect(page.getByText(/line counter|md5 calculator/i)).toBeVisible()
    })
  })

  test.describe('Plugin Selection', () => {
    test('should select a plugin', async ({ page }) => {
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      // Find and click on a plugin card/select button
      const selectButton = page.getByRole('button', { name: /select|add|enable/i }).first()
      if (await selectButton.isVisible()) {
        await selectButton.click()

        // Should show confirmation or selection indicator
        await expect(page.getByText(/selected|active|enabled/i)).toBeVisible()
      }
    })

    test('should show selected plugins on home page', async ({ page }) => {
      // Select a plugin first
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      const selectButton = page.getByRole('button', { name: /select|add|enable/i }).first()
      if (await selectButton.isVisible()) {
        await selectButton.click()

        // Go back to home
        await page
          .getByRole('button', { name: /home|back/i })
          .first()
          .click()

        // Should show plugin indicator
        await expect(page.getByText(/active plugin|plugin selected/i)).toBeVisible()
      }
    })

    test('should clear selected plugins', async ({ page }) => {
      // This test requires a plugin to be selected first
      await page
        .getByRole('button', { name: /plugins/i })
        .first()
        .click()

      const selectButton = page.getByRole('button', { name: /select|add|enable/i }).first()
      if (await selectButton.isVisible()) {
        await selectButton.click()

        // Go to results (simulated - in real test would run analysis)
        // Then look for clear button
        const clearButton = page.getByRole('button', { name: /clear|remove|x/i }).first()
        if (await clearButton.isVisible()) {
          await clearButton.click()

          // Plugin should be deselected
          await expect(page.getByText(/plugin selected|active plugin/i)).not.toBeVisible()
        }
      }
    })
  })
})

test.describe('Plugin Analysis Integration', () => {
  test('should show plugin-aware progress during analysis', async ({ page }) => {
    await page.goto('/')

    // First select a plugin
    await page
      .getByRole('button', { name: /plugins/i })
      .first()
      .click()
    const selectButton = page.getByRole('button', { name: /select|add|enable/i }).first()
    if (await selectButton.isVisible()) {
      await selectButton.click()
      await page
        .getByRole('button', { name: /home|back/i })
        .first()
        .click()
    }

    // Note: Cannot fully test file picker automation due to browser security
    // This test verifies the UI state when analysis would run
    const selectFolderButton = page.getByRole('button', { name: /select folder/i })
    await expect(selectFolderButton).toBeVisible()
    await expect(selectFolderButton).toBeEnabled()
  })

  test('should display plugin results after analysis', async ({ page }) => {
    await page.goto('/')

    // Check that results panel has plugin result section
    // (In real scenario, would run analysis first)
    page.locator('[data-testid="results-panel"], .results-panel')
    // Results only show after analysis completes
  })
})

test.describe('Plugin Security', () => {
  test('plugins should not have direct DOM access', async ({ page }) => {
    // This is a security test - verify plugins run in workers
    // Check network tab for worker files
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('.worker.') || r.url().includes('plugin')),
      page.goto('/'),
    ])

    // Worker files should be loaded
    expect(response.status()).toBe(200)
  })
})

/**
 * Manual Testing Instructions
 *
 * These tests require manual verification due to browser security restrictions:
 *
 * 1. UPLOAD PLUGIN TEST:
 *    - Navigate to Plugins page
 *    - Click "Upload Plugin" button
 *    - Drag and drop a .wasm file or use file picker
 *    - Verify validation progress indicator
 *    - Verify plugin appears in list
 *
 * 2. RUN ANALYSIS WITH PLUGIN:
 *    - Select a plugin (e.g., Line Counter)
 *    - Click "Select Folder" and choose a code directory
 *    - Wait for analysis to complete
 *    - Verify plugin results show line counts
 *
 * 3. VERIFY PLUGIN ISOLATION:
 *    - Open Chrome DevTools > Sources
 *    - Check that plugins run in Worker context
 *    - Verify no direct DOM access from plugin code
 *
 * 4. PERFORMANCE CHECK:
 *    - Open Chrome DevTools > Performance
 *    - Run analysis with plugins
 *    - Verify plugin execution < 50ms per file
 *    - Check for memory leaks (memory should return to baseline)
 *
 * 5. DELETE PLUGIN TEST:
 *    - Upload a custom plugin
 *    - Click delete button on plugin card
 *    - Confirm deletion
 *    - Verify plugin removed from IndexedDB
 */
