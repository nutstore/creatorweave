import { useEffect, useState } from 'react'
import { useAnalysisStore } from '@/store/analysis.store'
import { isSupported, selectFolder } from '@/services/fsAccess.service'
import { traverseDirectory } from '@/services/traversal.service'
import { analyzeFiles } from '@/services/analyzer.service'
import { Header } from '@/components/Header'
import { HeroSection } from '@/components/HeroSection'
import { ProgressPanel } from '@/components/ProgressPanel'
import { ResultsPanel } from '@/components/ResultsPanel'
import { ErrorDisplay } from '@/components/ErrorDisplay'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'

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

  // Check browser compatibility on mount
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)

  useEffect(() => {
    setIsSupportedBrowser(isSupported())
  }, [])

  const handleSelectFolder = async () => {
    try {
      reset()
      startAnalysis()

      const handle = await selectFolder()

      // Collect all files
      const files: any[] = []
      for await (const file of traverseDirectory(handle)) {
        files.push(file)

        // Update progress every 10 files
        if (files.length % 10 === 0) {
          updateProgress(
            files.length,
            files.reduce((sum, f) => sum + f.size, 0),
            file.path
          )
        }
      }

      // Analyze files
      const analysisResult = await analyzeFiles(files, (count, size, path) => {
        updateProgress(count, size, path)
      })

      completeAnalysis(analysisResult)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setError(errorMessage)
    }
  }

  const handleReanalyze = () => {
    reset()
    handleSelectFolder()
  }

  // Show unsupported browser message
  if (!isSupportedBrowser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <UnsupportedBrowser />
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <ErrorDisplay error={error} onRetry={handleReanalyze} onClose={reset} />
      </div>
    )
  }

  // Show progress
  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <ProgressPanel
          progress={progress}
          fileCount={fileCount}
          totalSize={totalSize}
          currentPath={currentPath}
        />
      </div>
    )
  }

  // Show results
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <ResultsPanel
          result={result}
          onReanalyze={handleReanalyze}
          onSelectFolder={handleSelectFolder}
        />
      </div>
    )
  }

  // Show hero section (default)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <HeroSection onSelectFolder={handleSelectFolder} isAnalyzing={isAnalyzing} />
    </div>
  )
}

export default App
