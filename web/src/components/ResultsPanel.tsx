import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle,
  FileText,
  HardDrive,
  TrendingUp,
  Folder,
  Clock,
  RefreshCcw,
} from 'lucide-react'
import { formatNumber, formatBytes, formatDuration } from '@/lib/utils'
import type { AnalysisResult } from '@/store/analysis.store'

interface ResultsPanelProps {
  result: AnalysisResult
  onReanalyze: () => void
  onSelectFolder: () => void
}

export function ResultsPanel({ result, onReanalyze, onSelectFolder }: ResultsPanelProps) {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
          <h3 className="mt-4 text-2xl font-bold text-gray-900">Analysis Complete</h3>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-blue-600" />
              <p className="text-2xl font-bold text-gray-900">{formatNumber(result.fileCount)}</p>
              <p className="text-sm text-gray-600">Total Files</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <HardDrive className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="text-2xl font-bold text-gray-900">{formatBytes(result.totalSize)}</p>
              <p className="text-sm text-gray-600">Total Size</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <TrendingUp className="mx-auto mb-2 h-8 w-8 text-purple-600" />
              <p className="text-2xl font-bold text-gray-900">{formatBytes(result.averageSize)}</p>
              <p className="text-sm text-gray-600">Average Size</p>
            </CardContent>
          </Card>
        </div>

        {result.maxFile && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h4 className="mb-4 font-semibold text-gray-900">Largest File</h4>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{result.maxFile.name}</p>
                  <p className="text-sm text-gray-600" title={result.maxFile.path}>
                    {result.maxFile.path.length > 60
                      ? '...' + result.maxFile.path.slice(-57)
                      : result.maxFile.path}
                  </p>
                </div>
                <p className="ml-4 text-lg font-semibold text-gray-900">
                  {formatBytes(result.maxFile.size)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
            <Folder className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm text-gray-600">Folders</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatNumber(result.folderCount)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
            <Clock className="h-5 w-5 text-gray-600" />
            <div>
              <p className="text-sm text-gray-600">Duration</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDuration(result.duration)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={onReanalyze} variant="default" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Reanalyze
          </Button>
          <Button onClick={onSelectFolder} variant="outline" className="gap-2">
            Select Different Folder
          </Button>
        </div>
      </div>
    </div>
  )
}
