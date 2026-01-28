import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">Browser File System Analyzer</h1>
          <p className="text-gray-600">Local file system analyzer powered by WebAssembly</p>
        </header>

        <div className="mx-auto max-w-2xl rounded-lg bg-white p-8 shadow-lg">
          <h2 className="mb-4 text-2xl font-semibold">Getting Started</h2>
          <p className="mb-6 text-gray-600">
            Click the button below to select a folder and start analyzing your local files
          </p>

          <button
            onClick={() => setCount((c) => c + 1)}
            className="rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
          >
            Select Folder (Test: {count})
          </button>

          <div className="mt-8 rounded-lg bg-blue-50 p-4">
            <h3 className="mb-2 font-semibold">Tech Stack</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>✅ React + TypeScript + Vite</li>
              <li>✅ Tailwind CSS + shadcn/ui</li>
              <li>✅ Zustand State Management</li>
              <li>✅ Rust + WebAssembly</li>
              <li>✅ File System Access API</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
