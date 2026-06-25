export function buildWebMCPGroupKey(hostname: string, toolsetSignature: string): string {
  return `${hostname}_${toolsetSignature}`
}
