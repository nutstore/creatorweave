export function normalizeBaseUrl(url: string | undefined | null): string {
  return (url ?? '').trim().replace(/\/+$/, '')
}
