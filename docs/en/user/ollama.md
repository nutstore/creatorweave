---
title: Connect Ollama (Local Models)
order: 4
---

# Connect Ollama (Local Models)

[Ollama](https://ollama.com) lets you run large language models (Qwen, Llama, DeepSeek, etc.) locally on your own machine. EO2Weave connects to Ollama through its built-in **OpenAI-compatible API** — no sign-up, no API key, and your conversations never leave your computer.

> This guide also applies to other local servers that expose an OpenAI-compatible API (LM Studio, llama.cpp server, vLLM, …). Just swap in the matching Base URL.

## Prerequisites

1. **Install and start Ollama**: download it from [ollama.com](https://ollama.com). After installation, Ollama automatically serves on port `11434` of your machine (check the menu bar / system tray icon).

2. **Pull a tool-capable model**. EO2Weave's agent features rely on function calling, so pick a model tagged with `tools` on the Ollama model library, for example:

   ```bash
   ollama pull qwen3        # tool calling supported, good Chinese support
   ollama pull llama3.1     # tool calling supported
   ```

   > ⚠️ Chat-only models without tool support cannot complete agent tasks (file read/write operations will fail or stall).

## Configure EO2Weave

1. Open **Settings → LLM Providers → Add Provider**
2. Fill in the form:

   | Field | Value |
   |-------|-------|
   | Provider name | Anything, e.g. `Ollama Local` |
   | API Base URL | `http://localhost:11434/v1` |
   | API mode | `Chat Completions` (default) |
   | API Key | **Leave it empty** |

3. Click **Create**
4. Expand the provider card and click **"Refresh models from API"** — models installed in Ollama will appear in the list (you can also type model names manually)
5. Pick an Ollama model from the top model switcher and start chatting

> 💡 The trailing `/v1` in the Base URL is **required** — it is the path prefix of the OpenAI-compatible layer. Omitting it makes every request 404.

## Cross-Origin (CORS) Configuration

EO2Weave is a browser app: chat requests go **from your browser directly to the local Ollama server**. For security reasons Ollama only accepts cross-origin requests from `localhost` by default, therefore:

| How you open EO2Weave | Works? |
|----------------------|--------|
| `http://localhost:xxxx` (local development) | ✅ Yes, no configuration needed |
| A deployed domain (e.g. `https://weave.example.com`) | ❌ Requires `OLLAMA_ORIGINS` |
| A LAN IP (e.g. `http://192.168.1.5:3000`) | ❌ Requires `OLLAMA_ORIGINS` |

**How to tell**: if a chat fails with `Failed to fetch`, open browser DevTools (F12) → Network panel. If the request to `localhost:11434` shows a CORS / cross-origin error, apply the configuration below.

### Setting `OLLAMA_ORIGINS`

Set the environment variable `OLLAMA_ORIGINS` to `*` (allow all origins) or to the exact origin EO2Weave is served from (multiple values separated by commas):

| OS | Steps |
|----|-------|
| **macOS** | Run `launchctl setenv OLLAMA_ORIGINS "*"` in a terminal, then fully quit Ollama from the menu bar and reopen it |
| **Windows** | Search "Edit environment variables for your account" in Start → add a **user variable** `OLLAMA_ORIGINS` with value `*`, then quit Ollama from the system tray and start it again |
| **Linux (systemd)** | Run `sudo systemctl edit ollama`, add `[Service]` section with `Environment="OLLAMA_ORIGINS=*"`, save, then `sudo systemctl daemon-reload && sudo systemctl restart ollama` |
| **Run in foreground** | `OLLAMA_ORIGINS="*" ollama serve` |

> 🔒 Pinning the exact origin is safer: e.g. `OLLAMA_ORIGINS="https://weave.example.com"`. `*` means **any website you open** may talk to your local models — only recommended for personal machines. See the [official Ollama FAQ](https://docs.ollama.com/faq) for details.

### When Ollama Runs on Another Machine

If Ollama is deployed on another host in your LAN:

1. Make Ollama listen on external interfaces: set `OLLAMA_HOST=0.0.0.0` and restart it
2. In EO2Weave, set the Base URL to `http://<host-IP>:11434/v1`
3. Configure `OLLAMA_ORIGINS` as described above (cross-origin always applies here)

> ⚠️ **Mixed content**: if the EO2Weave page is loaded over **https**, the browser blocks requests to plain-`http` LAN addresses (`localhost` is exempt). In that scenario either expose Ollama via an https reverse proxy, or open EO2Weave over http.

## Recommended Extra Configuration

| Environment variable | Purpose | Suggestion |
|---------------------|---------|------------|
| `OLLAMA_CONTEXT_LENGTH` | Default context length per model (default is small, ~4K tokens) | Set to `32768` or higher — agent work carries long system prompts and file contents; a small context makes the model "forget" or truncate |
| `OLLAMA_ORIGINS` | Allowed cross-origin origins | See the section above |
| `OLLAMA_HOST` | Listen address | Not needed when Ollama and the browser share a machine |

## Troubleshooting

| Symptom | Cause & fix |
|---------|------------|
| "Refresh models" fails with `Failed to fetch` | Ollama isn't running; or the request was blocked by CORS — configure `OLLAMA_ORIGINS` as above |
| Model list is empty | No models pulled yet — run `ollama pull` first |
| Chat returns 404 / model not found | Base URL is missing the trailing `/v1`; or the model was deleted (check with `ollama list`) |
| Chat works but the agent won't touch files / tool calls fail | The selected model doesn't support function calling — switch to `qwen3`, `llama3.1`, or another model tagged `tools` |
| Responses cut off mid-answer, or the model "forgets" earlier turns in long chats | Context length too small — raise `OLLAMA_CONTEXT_LENGTH` and restart Ollama |
| Top bar keeps showing "No API Key" | Make sure the currently selected provider is your Ollama **custom provider** (custom providers only need a Base URL, no key); built-in providers (OpenAI, DeepSeek, …) still require a key |

## How It Works (optional reading)

Since v0.1.24 Ollama ships with an OpenAI-compatible layer, and that is exactly what EO2Weave's custom providers call:

| Operation | Endpoint |
|-----------|----------|
| List models | `GET http://localhost:11434/v1/models` |
| Streaming chat (incl. tool calls) | `POST http://localhost:11434/v1/chat/completions` |

So Ollama's native `/api/generate` and `/api/chat` endpoints are **not** used in this flow and need no extra adaptation.
