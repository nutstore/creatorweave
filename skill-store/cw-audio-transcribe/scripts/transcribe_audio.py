import asyncio
import json
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from pyodide.http import pyfetch


DEFAULT_BASE_URL = "https://api.assemblyai.com"
DEFAULT_SPEECH_MODELS = ["universal-3-pro", "universal-2"]
DEFAULT_POLL_INTERVAL_SECONDS = 3.0
DEFAULT_TIMEOUT_SECONDS = 900.0
DEFAULT_REUSE_EXISTING = True
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mp4"}


def _resolve_api_key(api_key: Optional[str]) -> tuple[str, str]:
    """Resolve API key: explicit arg → env var → error."""
    if api_key and api_key.strip():
        return api_key.strip(), "argument"

    env_value = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
    if env_value:
        return env_value, "env:ASSEMBLYAI_API_KEY"

    raise RuntimeError(
        "AssemblyAI API key is missing. Set ASSEMBLYAI_API_KEY in "
        "Secret Manager (Settings → Secret Manager), or pass api_key='...' "
        "directly."
    )


def _coerce_speech_models(value: Any) -> list[str]:
    if value is None:
        return list(DEFAULT_SPEECH_MODELS)
    if isinstance(value, str):
        return [value]
    if isinstance(value, Iterable):
        result = [str(item).strip() for item in value if str(item).strip()]
        if result:
            return result
    return list(DEFAULT_SPEECH_MODELS)


def _coerce_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return bool(value)


def _format_ms(milliseconds: Optional[int]) -> str:
    if milliseconds is None:
        return "00:00:00.000"
    total_ms = max(int(milliseconds), 0)
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    seconds, ms = divmod(rem, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{ms:03d}"


def _validate_audio_file(audio_file: Path) -> None:
    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_file}")
    if not audio_file.is_file():
        raise RuntimeError(f"Audio path is not a file: {audio_file}")
    if audio_file.suffix.lower() not in ALLOWED_AUDIO_EXTENSIONS:
        raise RuntimeError(
            "Unsupported audio file extension. "
            f"Expected one of {sorted(ALLOWED_AUDIO_EXTENSIONS)}, got {audio_file.suffix or '(none)'}"
        )
    if audio_file.stat().st_size <= 0:
        raise RuntimeError(f"Audio file is empty: {audio_file}")


def _build_output_paths(audio_path: Path, output_dir: Optional[str]) -> tuple[Path, Path]:
    if output_dir:
        output_root = Path(output_dir)
        output_root.mkdir(parents=True, exist_ok=True)
        base = output_root / audio_path.stem
    else:
        base = audio_path.with_suffix("")
    return (
        base.with_name(base.name + ".transcript.md"),
        base.with_name(base.name + ".transcript.json"),
    )


def _artifacts_are_fresh(
    audio_file: Path,
    markdown_path: Path,
    json_path: Path,
    *,
    write_markdown: bool,
    write_json: bool,
) -> bool:
    needed: list[Path] = []
    if write_markdown:
        needed.append(markdown_path)
    if write_json:
        needed.append(json_path)
    if not needed:
        return False
    if not all(path.exists() for path in needed):
        return False
    audio_mtime = audio_file.stat().st_mtime
    return all(path.stat().st_mtime >= audio_mtime for path in needed)


def _read_text_file(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def _load_transcript_json(json_path: Path) -> Dict[str, Any]:
    if not json_path.exists():
        return {}
    with open(json_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _build_result(
    *,
    transcript: Dict[str, Any],
    audio_file: Path,
    markdown_path: Path,
    json_path: Path,
    speech_models: list[str],
    speaker_labels: bool,
    language_detection: bool,
    api_key_source: Optional[str],
    reused_existing: bool,
    output_dir: Optional[str],
    write_markdown: bool,
    write_json: bool,
) -> Dict[str, Any]:
    return {
        "provider": "assemblyai",
        "status": transcript.get("status", "completed"),
        "transcript_id": transcript.get("id"),
        "audio_path": str(audio_file),
        "markdown_path": str(markdown_path) if write_markdown else None,
        "json_path": str(json_path) if write_json else None,
        "text": transcript.get("text", "") or "",
        "language_code": transcript.get("language_code"),
        "audio_duration": transcript.get("audio_duration"),
        "utterance_count": len(transcript.get("utterances") or []),
        "speech_models": speech_models,
        "speaker_labels": speaker_labels,
        "language_detection": language_detection,
        "reused_existing": reused_existing,
        "output_dir": output_dir or str(audio_file.parent),
        "api_key_source": api_key_source,
    }


def load_existing_transcript(
    audio_path: str,
    *,
    output_dir: Optional[str] = None,
    write_markdown: bool = True,
    write_json: bool = True,
) -> Dict[str, Any]:
    audio_file = Path(audio_path)
    _validate_audio_file(audio_file)
    markdown_path, json_path = _build_output_paths(audio_file, output_dir)

    transcript: Dict[str, Any] = {}
    if json_path.exists():
        transcript = _load_transcript_json(json_path)
    elif markdown_path.exists():
        transcript = {
            "status": "completed",
            "text": _read_text_file(markdown_path),
            "utterances": [],
        }
    else:
        raise FileNotFoundError(
            "No existing transcript artifacts found. Expected one of: "
            f"{markdown_path}, {json_path}"
        )

    return _build_result(
        transcript=transcript,
        audio_file=audio_file,
        markdown_path=markdown_path,
        json_path=json_path,
        speech_models=[],
        speaker_labels=bool(transcript.get("utterances")),
        language_detection=bool(transcript.get("language_code")),
        api_key_source=None,
        reused_existing=True,
        output_dir=output_dir,
        write_markdown=write_markdown,
        write_json=write_json,
    )


async def _fetch_json(
    url: str,
    *,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    body: Any = None,
) -> Dict[str, Any]:
    response = await pyfetch(url, method=method, headers=headers or {}, body=body)
    if not response.ok:
        try:
            error_body = await response.string()
        except Exception:
            error_body = f"HTTP {response.status}"
        raise RuntimeError(f"{method} {url} failed: {response.status} {error_body}")
    return await response.json()


async def _upload_audio(base_url: str, api_key: str, audio_path: Path) -> str:
    mime_type = mimetypes.guess_type(str(audio_path))[0] or "application/octet-stream"
    with open(audio_path, "rb") as fh:
        audio_bytes = fh.read()

    payload = await _fetch_json(
        f"{base_url}/v2/upload",
        method="POST",
        headers={
            "authorization": api_key,
            "content-type": mime_type,
        },
        body=audio_bytes,
    )
    upload_url = payload.get("upload_url")
    if not upload_url:
        raise RuntimeError("AssemblyAI upload response did not include upload_url")
    return str(upload_url)


async def _submit_transcript_job(
    base_url: str,
    api_key: str,
    *,
    upload_url: str,
    speech_models: list[str],
    language_detection: bool,
    speaker_labels: bool,
) -> str:
    payload = {
        "audio_url": upload_url,
        "speech_models": speech_models,
        "language_detection": language_detection,
        "speaker_labels": speaker_labels,
    }
    response = await _fetch_json(
        f"{base_url}/v2/transcript",
        method="POST",
        headers={
            "authorization": api_key,
            "content-type": "application/json",
        },
        body=json.dumps(payload),
    )
    transcript_id = response.get("id")
    if not transcript_id:
        raise RuntimeError("AssemblyAI transcript response did not include id")
    return str(transcript_id)


async def _poll_transcript(
    base_url: str,
    api_key: str,
    transcript_id: str,
    *,
    poll_interval_seconds: float,
    timeout_seconds: float,
) -> Dict[str, Any]:
    elapsed = 0.0
    while elapsed <= timeout_seconds:
        response = await _fetch_json(
            f"{base_url}/v2/transcript/{transcript_id}",
            headers={"authorization": api_key},
        )
        status = response.get("status")
        if status == "completed":
            return response
        if status == "error":
            raise RuntimeError(
                f"AssemblyAI transcription failed: {response.get('error', 'unknown error')}"
            )
        await asyncio.sleep(poll_interval_seconds)
        elapsed += poll_interval_seconds

    raise RuntimeError(
        f"AssemblyAI transcription timed out after {timeout_seconds} seconds"
    )


def _markdown_for_transcript(audio_path: Path, transcript: Dict[str, Any]) -> str:
    transcript_id = transcript.get("id", "")
    text = transcript.get("text", "") or ""
    language_code = transcript.get("language_code", "")
    audio_duration = transcript.get("audio_duration")
    confidence = transcript.get("confidence")
    utterances = transcript.get("utterances") or []
    generated_at = datetime.now(timezone.utc).isoformat()

    lines = [
        f"# Transcript: {audio_path.name}",
        "",
        "## Metadata",
        "",
        "- Provider: AssemblyAI",
        f"- Transcript ID: {transcript_id}",
        f"- Source Audio: {audio_path}",
        f"- Language Code: {language_code or 'unknown'}",
        f"- Audio Duration (seconds): {audio_duration if audio_duration is not None else 'unknown'}",
        f"- Confidence: {confidence if confidence is not None else 'unknown'}",
        f"- Generated At (UTC): {generated_at}",
        "",
        "## Full Text",
        "",
        text.strip() or "_No transcript text returned._",
        "",
    ]

    if utterances:
        lines.extend(["## Utterances", ""])
        for item in utterances:
            speaker = item.get("speaker", "?")
            start = _format_ms(item.get("start"))
            end = _format_ms(item.get("end"))
            utterance_text = (item.get("text") or "").strip()
            lines.append(f"- [{start} - {end}] Speaker {speaker}: {utterance_text}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


async def transcribe_audio(
    audio_path: str,
    *,
    api_key: Optional[str] = None,
    output_dir: Optional[str] = None,
    reuse_existing: Optional[bool] = None,
    speech_models: Optional[Iterable[str]] = None,
    language_detection: Optional[bool] = None,
    speaker_labels: Optional[bool] = None,
    poll_interval_seconds: Optional[float] = None,
    timeout_seconds: Optional[float] = None,
    write_markdown: bool = True,
    write_json: bool = True,
) -> Dict[str, Any]:
    audio_file = Path(audio_path)
    _validate_audio_file(audio_file)

    resolved_api_key, api_key_source = _resolve_api_key(api_key)
    resolved_reuse_existing = (
        DEFAULT_REUSE_EXISTING if reuse_existing is None else reuse_existing
    )
    resolved_speech_models = _coerce_speech_models(speech_models)
    resolved_language_detection = (
        language_detection if language_detection is not None else True
    )
    resolved_speaker_labels = (
        speaker_labels if speaker_labels is not None else True
    )
    resolved_poll_interval = float(
        poll_interval_seconds if poll_interval_seconds is not None
        else DEFAULT_POLL_INTERVAL_SECONDS
    )
    resolved_timeout = float(
        timeout_seconds if timeout_seconds is not None
        else DEFAULT_TIMEOUT_SECONDS
    )

    markdown_path, json_path = _build_output_paths(audio_file, output_dir)
    if resolved_reuse_existing and _artifacts_are_fresh(
        audio_file,
        markdown_path,
        json_path,
        write_markdown=write_markdown,
        write_json=write_json,
    ):
        transcript = _load_transcript_json(json_path) if json_path.exists() else {}
        if not transcript and markdown_path.exists():
            transcript = {
                "status": "completed",
                "text": _read_text_file(markdown_path),
                "utterances": [],
            }
        return _build_result(
            transcript=transcript,
            audio_file=audio_file,
            markdown_path=markdown_path,
            json_path=json_path,
            speech_models=resolved_speech_models,
            speaker_labels=resolved_speaker_labels,
            language_detection=resolved_language_detection,
            api_key_source=api_key_source,
            reused_existing=True,
            output_dir=output_dir,
            write_markdown=write_markdown,
            write_json=write_json,
        )

    upload_url = await _upload_audio(DEFAULT_BASE_URL, resolved_api_key, audio_file)
    transcript_id = await _submit_transcript_job(
        DEFAULT_BASE_URL,
        resolved_api_key,
        upload_url=upload_url,
        speech_models=resolved_speech_models,
        language_detection=resolved_language_detection,
        speaker_labels=resolved_speaker_labels,
    )
    transcript = await _poll_transcript(
        DEFAULT_BASE_URL,
        resolved_api_key,
        transcript_id,
        poll_interval_seconds=resolved_poll_interval,
        timeout_seconds=resolved_timeout,
    )

    if write_markdown:
        markdown_content = _markdown_for_transcript(audio_file, transcript)
        with open(markdown_path, "w", encoding="utf-8") as fh:
            fh.write(markdown_content)
    if write_json:
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(transcript, fh, ensure_ascii=False, indent=2)

    return _build_result(
        transcript=transcript,
        audio_file=audio_file,
        markdown_path=markdown_path,
        json_path=json_path,
        speech_models=resolved_speech_models,
        speaker_labels=resolved_speaker_labels,
        language_detection=resolved_language_detection,
        api_key_source=api_key_source,
        reused_existing=False,
        output_dir=output_dir,
        write_markdown=write_markdown,
        write_json=write_json,
    )


async def transcribe_or_reuse(audio_path: str, **kwargs: Any) -> Dict[str, Any]:
    kwargs.setdefault("reuse_existing", True)
    return await transcribe_audio(audio_path, **kwargs)
