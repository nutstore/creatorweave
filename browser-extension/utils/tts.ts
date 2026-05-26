// ============================================================
// Edge TTS — Voice List API (runs in background service worker)
//
// Uses fetch() to list available voices. DNR rule #101 modifies
// the request headers to spoof Edge User-Agent for this fetch.
//
// The actual synthesis (WebSocket) runs in an offscreen document
// because DNR cannot modify WebSocket headers from service workers
// (Chromium bug #1285664). See public/offscreen-tts.html.
// ============================================================

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH_SECONDS = 11644473600;

let _clockSkewSeconds = 0;

async function generateSecMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + _clockSkewSeconds;
  ticks += WIN_EPOCH_SECONDS;
  ticks -= ticks % 300;
  ticks = ticks * 1e7;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(strToHash));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// ============================================================
// Types
// ============================================================

export interface TTSVoice { ShortName: string; Name: string; Locale: string; Language: string; Gender: string; Status: string; }

// ============================================================
// List available voices (uses fetch — DNR works for fetch)
// ============================================================

export async function listVoices(): Promise<TTSVoice[]> {
  const secMsGec = await generateSecMsGec();
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.75`;

  const resp = await fetch(url);

  if (!resp.ok) {
    if (resp.status === 403) {
      const serverDate = resp.headers.get('Date');
      if (serverDate) {
        _clockSkewSeconds = Math.floor(new Date(serverDate).getTime() / 1000) - Math.floor(Date.now() / 1000);
        return listVoices(); // retry with corrected clock
      }
    }
    throw new Error(`Failed to list voices: ${resp.status}`);
  }
  return resp.json();
}
