import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, HardDrive, FileText } from 'lucide-react'
import { formatNumber, formatBytes } from '@/lib/utils'

interface ProgressPanelProps {
  progress: number
  fileCount: number
  totalSize: number
  currentPath: string | null
}

export function ProgressPanel({ progress, fileCount, totalSize, currentPath }: ProgressPanelProps) {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <h3 className="mt-4 text-xl font-semibold text-gray-900">Analyzing...</h3>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm text-gray-600">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Files Found</p>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(fileCount)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                <HardDrive className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Size</p>
                  <p className="text-2xl font-bold text-gray-900">{formatBytes(totalSize)}</p>
                </div>
              </div>
            </div>

            {currentPath && (
              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-600">Current File</p>
                <p className="truncate font-mono text-xs text-gray-700" title={currentPath}>
                  {currentPath}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
