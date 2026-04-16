export function buildSnapshotSummaryPrompt(
  changeCount: number,
  changesText: string,
  diffSections: string[]
): string {
  return [
    'Generate a commit message for the following changes.',
    'Requirements:',
    '1) Output complete message, can be multiple lines',
    '2) First line is a short subject (recommended under 72 characters)',
    '3) Following is body, 2-6 lines, describing key changes',
    '4) Language is flexible, choose Chinese or English based on context',
    '5) Do not explain yourself, no code blocks',
    '6) Output message directly, no SUBJECT:/BODY: prefixes',
    'Example (style reference only):',
    'Refactor snapshot rollback flow',
    '',
    '- Track before/after file states for each approved change',
    '- Improve snapshot switch reliability with compensation logic',
    '',
    `Change count: ${changeCount}`,
    changesText,
    '',
    ...(diffSections.length > 0
      ? ['Key diff:', diffSections.join('\n\n')]
      : ['Key diff:', '[diff unavailable; summarize based on file list]']),
  ].join('\n')
}
