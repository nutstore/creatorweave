import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { toast } from 'sonner'
import {
  WEBMCP_DOC_URL,
  WEBMCP_FLAGS_URL,
  WEBMCP_MIN_CHROME_VERSION,
  detectWebMCPBrowserSupport,
} from '@/webmcp'

interface WebMCPSetupGuideCardProps {
  t: (key: string) => string
}

function getBrowserLabel(kind: 'chrome' | 'edge' | 'other' | 'unknown'): string {
  if (kind === 'chrome') return 'Chrome'
  if (kind === 'edge') return 'Edge'
  if (kind === 'other') return 'Other'
  return 'Unknown'
}

export function WebMCPSetupGuideCard({ t }: WebMCPSetupGuideCardProps) {
  const support = useMemo(() => detectWebMCPBrowserSupport(), [])
  const [copied, setCopied] = useState(false)

  const handleOpenFlags = () => {
    const opened = window.open(WEBMCP_FLAGS_URL, '_blank', 'noopener,noreferrer')
    if (!opened) {
      toast.info(t('settings.webMCPFlagsOpenFallback'))
    }
  }

  const handleOpenDocs = () => {
    window.open(WEBMCP_DOC_URL, '_blank', 'noopener,noreferrer')
  }

  const handleCopyFlags = async () => {
    try {
      await navigator.clipboard.writeText(WEBMCP_FLAGS_URL)
      setCopied(true)
      toast.success(t('settings.webMCPCopied'))
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`${t('settings.webMCPCopyFlagsFailed')}: ${message}`)
    }
  }

  const browserLine = t('settings.webMCPDetectedBrowser')
    .replace('{browser}', getBrowserLabel(support.kind))
    .replace('{version}', support.version || '-')

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-sm font-medium text-secondary dark:text-neutral-200">
        {t('settings.webMCPSetupTitle')}
      </p>
      <p className="mt-1 text-xs text-tertiary">
        {t('settings.webMCPMinChrome').replace('{version}', WEBMCP_MIN_CHROME_VERSION)}
      </p>
      <p className="mt-1 text-xs text-tertiary">{browserLine}</p>

      {!support.isSupported && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {support.reason === 'version-too-low'
            ? t('settings.webMCPVersionTooLow')
            : t('settings.webMCPUnsupportedBrowser')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <BrandButton variant="outline" className="h-8 gap-2 text-xs" onClick={handleOpenFlags}>
          <ExternalLink className="h-3.5 w-3.5" />
          {t('settings.webMCPOpenFlags')}
        </BrandButton>
        <BrandButton variant="outline" className="h-8 gap-2 text-xs" onClick={handleCopyFlags}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('settings.webMCPCopied') : t('settings.webMCPCopyFlags')}
        </BrandButton>
        <BrandButton variant="outline" className="h-8 gap-2 text-xs" onClick={handleOpenDocs}>
          <ExternalLink className="h-3.5 w-3.5" />
          {t('settings.webMCPReadDocs')}
        </BrandButton>
      </div>
    </div>
  )
}
