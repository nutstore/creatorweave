import type { Metadata } from 'next'
import { PrivacyPage } from './PrivacyPage'

export const metadata: Metadata = {
  title: 'Privacy Policy — EO2Weave',
  description: 'How the EO2Weave browser extension processes data, protects local files, and gives you control over website tools.',
  alternates: {
    canonical: '/privacy/',
    languages: {
      en: '/privacy/',
      'zh-CN': '/privacy/zh/',
    },
  },
  robots: { index: true, follow: true },
}

export default function EnglishPrivacyPage() {
  return <PrivacyPage locale="en" />
}
