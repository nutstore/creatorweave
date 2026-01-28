import { Folder, Moon } from 'lucide-react'

export function Header() {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Folder className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Browser File System Analyzer</h1>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Toggle theme"
        >
          <Moon className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
