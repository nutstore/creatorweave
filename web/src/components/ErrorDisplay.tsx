import { Button } from '@/components/ui/button'
import { AlertCircle, X, RefreshCcw } from 'lucide-react'

interface ErrorDisplayProps {
  error: string
  onRetry: () => void
  onClose: () => void
}

export function ErrorDisplay({ error, onRetry, onClose }: ErrorDisplayProps) {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border-2 border-red-200 bg-red-50 p-8">
          <div className="mb-4 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <h3 className="text-xl font-semibold text-gray-900">An Error Occurred</h3>
          </div>

          <p className="mb-6 text-gray-700">{error}</p>

          <div className="flex gap-3">
            <Button onClick={onRetry} variant="default" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
            <Button onClick={onClose} variant="ghost" className="gap-2">
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
