import { useEffect, useState } from 'react'
import { useAnalysisStore } from '@/store/analysis.store'
import { isSupported, selectFolderOrUseSaved } from '@/services/fsAccess.service'
import { traverseDirectory } from '@/services/traversal.service'
import { analyzeFiles } from '@/services/analyzer.service'
import { getPluginLoader } from '@/services/plugin-loader.service'
import { PluginExecutorService } from '@/services/plugin-executor.service'
import { Header } from '@/components/Header'
import type { AppView } from '@/components/Header'
import { HeroSection } from '@/components/HeroSection'
import { ProgressPanel } from '@/components/ProgressPanel'
import { ResultsPanel } from '@/components/ResultsPanel'
import { ErrorDisplay } from '@/components/ErrorDisplay'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { PluginManager } from '@/components/plugins'
import { MainLayout } from '@/components/layout/MainLayout'
import type {
  PluginInstance,
  Plugin,
  FileEntry,
  FileResult,
  PluginResultWithMetadata,
} from '@/types/plugin'

function App() {
  const {
    isAnalyzing,
    progress,
    fileCount,
    totalSize,
    currentPath,
    error,
    result,
    startAnalysis,
    updateProgress,
    completeAnalysis,
    setError,
    reset,
  } = useAnalysisStore()

  // Current view state
  const [currentView, setCurrentView] = useState<AppView>('home')

  // Selected plugin state
  const [selectedPlugins, setSelectedPlugins] = useState<PluginInstance[]>([])

  // Check browser compatibility on mount
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)

  useEffect(() => {
    setIsSupportedBrowser(isSupported())
  }, [])

  const handleSelectFolder = async () => {
    await analyzeSelectedFolder(false)
  }

  const handleReanalyze = async () => {
    await analyzeSelectedFolder(true)
  }

  const handleClearPlugin = () => {
    setSelectedPlugins([])
  }

  // Analyze a folder - use saved handle if available for reanalyze
  async function analyzeSelectedFolder(useSavedIfAvailable: boolean) {
    console.log('[App] analyzeSelectedFolder called, useSavedIfAvailable:', useSavedIfAvailable)
    try {
      reset()
      startAnalysis()

      // Always show picker for fresh selection (not reanalyze)
      // useSavedIfAvailable=true means we're reanalyzing the same folder
      const dirHandle = useSavedIfAvailable
        ? await selectFolderOrUseSaved(false)
        : await selectFolderOrUseSaved(true) // forceNewSelection=true

      console.log('[App] dirHandle:', dirHandle)

      if (!dirHandle) {
        setError('No folder selected')
        return
      }

      await analyzeFolder(dirHandle)
    } catch (error) {
      console.error('[App] Error in analyzeSelectedFolder:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      // Ignore "File picker already active" errors - they're just rapid clicks
      if (!errorMessage.includes('File picker already active')) {
        setError(errorMessage)
      }
    }
  }

  // Analyze a folder with the given handle
  async function analyzeFolder(dirHandle: FileSystemDirectoryHandle) {
    // Collect files and their handles for plugin processing
    const filesWithHandles: Array<{ entry: FileEntry; handle: FileSystemFileHandle }> = []

    // Create a wrapper generator that collects files and handles while traversing
    async function* traverseAndCollect() {
      for await (const metadata of traverseDirectory(dirHandle)) {
        // For files, also get the file handle
        if (metadata.type === 'file') {
          // Navigate to the file handle through the directory
          const pathParts = metadata.path.split('/')
          let currentHandle: FileSystemDirectoryHandle = dirHandle

          // Navigate through directories to get the file handle
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i]
            currentHandle = await currentHandle.getDirectoryHandle(part)
          }

          const fileHandle = await currentHandle.getFileHandle(metadata.name)

          filesWithHandles.push({
            entry: {
              name: metadata.name,
              path: metadata.path,
              size: metadata.size,
              type: 'file',
              mimeType: undefined,
              lastModified: metadata.lastModified,
            },
            handle: fileHandle,
          })
        }
        yield metadata
      }
    }

    // Stream files directly to analyzer - no need to collect all in memory
    const analysisResult = await analyzeFiles(traverseAndCollect(), (count, size, path) => {
      updateProgress(count, size, path)
    })

    // Execute plugins if any are selected
    if (selectedPlugins.length > 0 && filesWithHandles.length > 0) {
      try {
        const loader = getPluginLoader()

        // Load all selected plugins
        for (const plugin of selectedPlugins) {
          if (!loader.isLoaded(plugin.metadata.id)) {
            const wasmId = plugin.metadata.id.replace(/-/g, '_')
            const wasmUrl = `/wasm/${wasmId}_bg.wasm`
            await loader.loadPluginFromUrl(wasmUrl)
          }
        }

        // Load file contents - only load once for all plugins
        const filesWithContent: FileEntry[] = []

        for (const { entry, handle } of filesWithHandles) {
          const file = await handle.getFile()
          const content = new Uint8Array(await file.arrayBuffer())
          filesWithContent.push({ ...entry, content })
        }

        console.log(
          `[App] Loaded ${filesWithContent.length} files for ${selectedPlugins.length} plugins`
        )

        // Get the actual loaded plugin instances with correct metadata
        const loadedPlugins = selectedPlugins
          .map((p) => loader.getPlugin(p.metadata.id))
          .filter((p): p is PluginInstance => p !== undefined)

        // Execute plugins in parallel
        const executor = new PluginExecutorService()
        const plugins: Plugin[] = loadedPlugins.map((p) => ({
          id: p.metadata.id,
          metadata: p.metadata, // Use the actual WASM metadata
        }))

        const parallelResults = await executor.executeParallel(plugins, filesWithContent, {
          onProgress: (progress) => {
            updateProgress(analysisResult.fileCount, analysisResult.totalSize, progress.currentFile)
          },
        })

        // Aggregate results from all plugins
        const allFileResults: FileResult[] = []
        const pluginResults: PluginResultWithMetadata[] = []

        for (const [_pluginId, execResultWrapper] of parallelResults.entries()) {
          // execResultWrapper contains: { pluginId, result }
          const execResult = execResultWrapper.result
          const plugin = loadedPlugins.find((p) => p.metadata.id === execResultWrapper.pluginId)

          if (execResult.finalResult) {
            pluginResults.push({
              ...execResult.finalResult,
              pluginId: execResultWrapper.pluginId,
              pluginName: plugin?.metadata.name,
              pluginVersion: plugin?.metadata.version,
            })
          }

          // Merge file results by path
          for (const fileResult of execResult.results) {
            const existing = allFileResults.find((fr) => fr.path === fileResult.path)
            if (existing) {
              // Merge plugin outputs into existing file result
              const existingData =
                existing.output?.data && typeof existing.output.data === 'object'
                  ? (existing.output.data as Record<string, unknown>)
                  : {}
              const newData =
                fileResult.output?.data && typeof fileResult.output.data === 'object'
                  ? (fileResult.output.data as Record<string, unknown>)
                  : {}

              existing.output = {
                path: existing.output?.path || fileResult.path,
                status: existing.output?.status || fileResult.output?.status || 'Success',
                data: { ...existingData, ...newData },
                error: fileResult.output?.error,
              }
            } else {
              allFileResults.push({
                path: fileResult.path,
                name: fileResult.path.split('/').pop() || fileResult.path,
                size: filesWithContent.find((f) => f.path === fileResult.path)?.size || 0,
                output: fileResult.output,
                success: fileResult.success,
              })
            }
          }
        }

        // Store results
        analysisResult.fileResults = allFileResults
        analysisResult.pluginResults = pluginResults
        analysisResult.pluginsProcessed = selectedPlugins.length

        console.log(`[App] Processed files with ${parallelResults.size} plugins`)
        console.log(`[App] File results count:`, allFileResults.length)
        console.log(`[App] Plugin results count:`, pluginResults.length)
        console.log(`[App] First file result:`, allFileResults[0])
        console.log(`[App] First plugin result:`, pluginResults[0])
      } catch (pluginError) {
        console.error('Plugin execution failed:', pluginError)
        // Set error result
        analysisResult.pluginResult = {
          summary: `Plugin execution failed: ${pluginError instanceof Error ? pluginError.message : String(pluginError)}`,
          filesProcessed: 0,
          filesSkipped: 0,
          filesWithErrors: filesWithHandles.length,
          metrics: {},
          warnings: [pluginError instanceof Error ? pluginError.message : String(pluginError)],
        }
      }
    }

    completeAnalysis(analysisResult)
  }

  // Show unsupported browser message
  if (!isSupportedBrowser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header currentView={currentView} onViewChange={setCurrentView} />
        <UnsupportedBrowser />
      </div>
    )
  }

  // Show agent view with dual-pane layout
  if (currentView === 'agent') {
    return (
      <div className="flex h-screen flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
        <div className="flex-1 overflow-hidden">
          <MainLayout />
        </div>
      </div>
    )
  }

  // Show plugins view
  if (currentView === 'plugins') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
        <div className="container mx-auto px-4 py-8">
          <PluginManager
            selectedPlugins={selectedPlugins}
            onPluginsSelect={(plugins) => setSelectedPlugins(plugins)}
          />
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
        <ErrorDisplay error={error} onRetry={handleReanalyze} onClose={reset} />
      </div>
    )
  }

  // Show progress
  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
        <ProgressPanel
          progress={progress}
          fileCount={fileCount}
          totalSize={totalSize}
          currentPath={currentPath}
          selectedPlugins={selectedPlugins}
        />
      </div>
    )
  }

  // Show results
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
        <ResultsPanel
          result={result}
          onReanalyze={handleReanalyze}
          onSelectFolder={handleSelectFolder}
          selectedPlugins={selectedPlugins}
          onClearPlugin={handleClearPlugin}
        />
      </div>
    )
  }

  // Show hero section (default)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedPlugins={selectedPlugins}
        onClearPlugin={handleClearPlugin}
      />
      <HeroSection
        onSelectFolder={handleSelectFolder}
        isAnalyzing={isAnalyzing}
        selectedPlugins={selectedPlugins}
      />
    </div>
  )
}

export default App
