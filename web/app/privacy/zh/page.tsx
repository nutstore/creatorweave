import type { Metadata } from 'next'
import { PrivacyPage } from '../PrivacyPage'

export const metadata: Metadata = {
  title: '隐私政策 — EO2Weave',
  description: '了解 EO2Weave 浏览器扩展如何处理数据、保护本地文件，以及如何让你管理网站工具授权。',
  alternates: {
    canonical: '/privacy/zh/',
    languages: {
      en: '/privacy/',
      'zh-CN': '/privacy/zh/',
    },
  },
  robots: { index: true, follow: true },
}

export default function ChinesePrivacyPage() {
  return <PrivacyPage locale="zh" />
}
