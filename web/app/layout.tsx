import type { Metadata } from 'next'
import '../src/styles/globals.css'
import '../src/components/plugins/plugin-ui.css'
import 'sonner/dist/styles.css'

export const metadata: Metadata = {
  title: 'EO2Weave',
  description: 'AI-native creator workspace with local-first files, knowledge workflows, and multi-agent orchestration',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
