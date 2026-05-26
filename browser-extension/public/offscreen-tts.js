// ============================================================
// Offscreen Document — Edge TTS WebSocket Client
//
// WHY OFFSCREEN: Chrome DNR doesn't intercept WebSocket headers
// from Service Workers (Chromium bug #1285664). Moving the WS
// connection to this offscreen document (renderer process) lets
// DNR properly spoof Edge User-Agent headers.
// ============================================================

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH_SECONDS = 11644473600;

async function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
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

function uuidV4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildSSML(text, voice, options) {
  options = options || {};
  const rate = options.rate || '+0%';
  const pitch = options.pitch || '+0Hz';
  const volume = options.volume || '+0%';
  const langMatch = voice.match(/^([a-z]{2}-[A-Z]{2})/);
  const lang = langMatch ? langMatch[1] : 'en-US';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + lang + "'><voice name='" + voice + "'><prosody rate='" + rate + "' pitch='" + pitch + "' volume='" + volume + "'>" + escaped + "</prosody></voice></speak>";
}

function extractAudioFromBinary(data) {
  if (data.byteLength < 2) return null;
  const headerLength = new DataView(data).getUint16(0);
  if (data.byteLength <= headerLength + 2) return null;
  return new Uint8Array(data, headerLength + 2);
}

function parseTextHeaders(text) {
  var headers = {};
  for (var i = 0; i < text.split('\r\n').length; i++) {
    var line = text.split('\r\n')[i];
    var idx = line.indexOf(':');
    if (idx > 0) headers[line.substring(0, idx)] = line.substring(idx + 1);
  }
  return headers;
}

function synthesize(text, options) {
  options = options || {};
  var voice = options.voice || 'en-US-AriaNeural';
  var outputFormat = options.outputFormat || 'audio-24khz-48kbitrate-mono-mp3';
  var connectionId = uuidV4();
  var requestId = uuidV4();

  return generateSecMsGec().then(function(secMsGec) {
    var params = new URLSearchParams({
      TrustedClientToken: TRUSTED_CLIENT_TOKEN,
      'Sec-MS-GEC': secMsGec,
      'Sec-MS-GEC-Version': '1-143.0.3650.75',
      ConnectionId: connectionId,
    });
    var url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?' + params.toString();

    console.log('[Offscreen TTS] Connecting... Voice: ' + voice + ', Text: "' + text.substring(0, 50) + '"');

    return new Promise(function(resolve) {
      var audioChunks = [];
      var wordBoundaries = [];
      var resolved = false;

      var ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      var timeout = setTimeout(function() {
        if (!resolved) { resolved = true; ws.close(); resolve({ ok: false, error: 'TTS timed out (30s)' }); }
      }, 30000);

      ws.addEventListener('open', function() {
        console.log('[Offscreen TTS] WS connected!');

        var configBody = JSON.stringify({
          context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: outputFormat } } },
        });
        ws.send('X-Timestamp:' + new Date().toISOString() + 'Z\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' + configBody);

        var ssml = buildSSML(text, voice, options);
        ws.send('X-RequestId:' + requestId + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + new Date().toISOString() + 'Z\r\nPath:ssml\r\n\r\n' + ssml);
        console.log('[Offscreen TTS] SSML sent');
      });

      ws.addEventListener('message', function(event) {
        if (typeof event.data === 'string') {
          var headers = parseTextHeaders(event.data);
          var path = headers['Path'];

          if (path === 'turn.start') {
            console.log('[Offscreen TTS] Synthesis started');
          } else if (path === 'turn.end') {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              ws.close();
              var totalLength = 0;
              for (var i = 0; i < audioChunks.length; i++) totalLength += audioChunks[i].length;
              var audio = new Uint8Array(totalLength);
              var offset = 0;
              for (var i = 0; i < audioChunks.length; i++) { audio.set(audioChunks[i], offset); offset += audioChunks[i].length; }
              var binary = '';
              for (var i = 0; i < audio.length; i++) {
                binary += String.fromCharCode(audio[i]);
              }
              var audioBase64 = btoa(binary);
              console.log('[Offscreen TTS] Done! Audio: ' + totalLength + ' bytes');
              resolve({ ok: true, audioBase64: audioBase64, wordBoundaries: wordBoundaries });
            }
          } else if (path === 'response') {
            var bodyStart = event.data.indexOf('\r\n\r\n');
            if (bodyStart >= 0) {
              try {
                var body = JSON.parse(event.data.substring(bodyStart + 4));
                console.log('[Offscreen TTS] Response:', body);
                if (body && body.code && body.code !== 200) {
                  clearTimeout(timeout);
                  if (!resolved) { resolved = true; ws.close(); resolve({ ok: false, error: 'Server error: ' + JSON.stringify(body) }); }
                }
              } catch(e) {}
            }
          } else if (path === 'audio.metadata') {
            try {
              var bodyStart = event.data.indexOf('\r\n\r\n');
              if (bodyStart >= 0) {
                var metadata = JSON.parse(event.data.substring(bodyStart + 4));
                if (metadata && metadata.Metadata) {
                  for (var j = 0; j < metadata.Metadata.length; j++) {
                    var item = metadata.Metadata[j];
                    if (item.Type === 'WordBoundary' && item.Data && item.Data.text) {
                      wordBoundaries.push({ offset: item.Data.Offset || 0, duration: item.Data.Duration || 0, text: item.Data.text.Text || '' });
                    }
                  }
                }
              }
            } catch(e) {}
          }
        } else if (event.data instanceof ArrayBuffer) {
          var audioData = extractAudioFromBinary(event.data);
          if (audioData) audioChunks.push(audioData);
        }
      });

      ws.addEventListener('error', function() {
        clearTimeout(timeout);
        console.error('[Offscreen TTS] WS error');
        if (!resolved) { resolved = true; resolve({ ok: false, error: 'WebSocket connection error' }); }
      });

      ws.addEventListener('close', function(event) {
        clearTimeout(timeout);
        console.log('[Offscreen TTS] WS closed: ' + event.code + ' ' + (event.reason || ''));
        if (!resolved && audioChunks.length === 0) {
          resolved = true;
          resolve({ ok: false, error: 'WebSocket closed (' + event.code + ': ' + (event.reason || 'none') + ')' });
        }
      });
    });
  });
}

// Message handler
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'tts_offscreen_synthesize') {
    synthesize(message.text, {
      voice: message.voice,
      rate: message.rate,
      pitch: message.pitch,
      volume: message.volume,
      outputFormat: message.outputFormat,
    }).then(sendResponse);
    return true;
  }

  if (message.type === 'tts_offscreen_ping') {
    sendResponse({ ok: true, pong: true });
    return;
  }
});

console.log('[Offscreen TTS] Ready');
