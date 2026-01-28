import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const browsers = [
  {
    name: 'Google Chrome 86+',
    icon: '🌐',
    downloadUrl: 'https://www.google.com/chrome/',
  },
  {
    name: 'Microsoft Edge 86+',
    icon: '🌐',
    downloadUrl: 'https://www.microsoft.com/edge',
  },
  {
    name: 'Opera 72+',
    icon: '🎭',
    downloadUrl: 'https://www.opera.com/',
  },
]

export function UnsupportedBrowser() {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-8">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <h3 className="text-xl font-semibold text-gray-900">Browser Not Supported</h3>
            </div>

            <p className="mb-6 text-gray-700">
              Your browser does not support the File System Access API. Please use one of the
              following browsers:
            </p>

            <div className="space-y-3">
              {browsers.map((browser) => (
                <a
                  key={browser.name}
                  href={browser.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{browser.icon}</span>
                      <span className="font-medium text-gray-900">{browser.name}</span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
