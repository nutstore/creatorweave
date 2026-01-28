import { Button } from '@/components/ui/button'
import { FolderOpen } from 'lucide-react'

interface HeroSectionProps {
  onSelectFolder: () => void
  isAnalyzing: boolean
}

export function HeroSection({ onSelectFolder, isAnalyzing }: HeroSectionProps) {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-4xl font-bold text-gray-900 sm:text-5xl">Analyze Local Folders</h2>
        <p className="mb-8 text-lg text-gray-600">
          Quickly understand file size distribution without uploading any data
        </p>

        <Button size="lg" onClick={onSelectFolder} disabled={isAnalyzing} className="gap-2">
          <FolderOpen className="h-5 w-5" />
          Select Folder
        </Button>

        <div className="mt-12 rounded-lg bg-blue-50 p-6 text-left">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
            Browser Compatibility
          </h3>
          <p className="mb-3 text-sm text-gray-700">
            This feature requires browsers that support the File System Access API:
          </p>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>• Google Chrome 86+</li>
            <li>• Microsoft Edge 86+</li>
            <li>• Opera 72+</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
