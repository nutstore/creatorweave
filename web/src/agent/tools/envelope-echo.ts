/**
 * Envelope-echo stripping — defense against read()→write() content pollution.
 *
 * Incident background: some format handlers used to prefix read() content
 * with an envelope header (e.g. `[HTML] index.html`). Models echoing read()
 * output back into write()/edit() content corrupted files at the very top —
 * browser-extension/entrypoints/popup/index.html was hit three times before
 * the source-side fix landed. The handlers are fixed; this module is the
 * write-side defense-in-depth against residual echoes (old conversation
 * replays, unfixed future handlers, subagents running older prompts).
 */

/**
 * Matches a leading `[<LABEL>] <name>` header line.
 * LABEL: short alphabetic tag (HTML, CSV, TS, JSON, Word Document …).
 * NAME: everything up to end of line — compared against the target file name.
 */
const ENVELOPE_ECHO_HEADER_RE = /^\[([A-Za-z][A-Za-z0-9 _-]{0,30})\] ([^\n]+)\n+/

/**
 * Strip a leading envelope-echo header that models sometimes copy from read()
 * output back into write() content.
 *
 * Only strips when the first line is EXACTLY `[<LABEL>] <this file's base
 * name or full path>` — the strict name match prevents false positives on
 * legitimate content like `[TODO] buy milk` written to notes.md.
 *
 * @returns the (possibly cleaned) content and whether a header was stripped.
 */
export function stripEnvelopeEchoHeader(
  content: string,
  path: string
): { content: string; stripped: boolean } {
  if (!content.startsWith('[')) return { content, stripped: false }
  const match = content.match(ENVELOPE_ECHO_HEADER_RE)
  if (!match) return { content, stripped: false }
  const fileName = path.split('/').pop() || path
  const echoedName = match[2].trim()
  // Accept basename echo (`[HTML] index.html`) and full-path echo (`[CSV] root/data/x.csv`)
  if (echoedName !== fileName && !echoedName.endsWith('/' + fileName)) {
    return { content, stripped: false }
  }
  return { content: content.slice(match[0].length), stripped: true }
}
