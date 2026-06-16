import base64
import os
import re
import tempfile
import wave
from functools import lru_cache
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


SAMPLE_RATE = 16_000
LANGUAGES = {
    "cs": "Czech",
    "sk": "Slovak",
    "de": "German",
    "en": "English",
}


class TranslateRequest(BaseModel):
    audioBase64: str
    mimeType: str
    targetLanguage: str = "cs"


app = FastAPI(title="YouTube Voice Translate Gemma Runner")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": os.environ.get("MODEL_ID", "google/gemma-4-E4B-it")}


@app.post("/translate")
def translate(request: TranslateRequest) -> dict[str, Any]:
    if "audio/pcm" not in request.mimeType or "f32le" not in request.mimeType:
        raise HTTPException(
            status_code=415,
            detail=f"Expected 16 kHz mono float32 PCM, got {request.mimeType}",
        )

    audio = decode_pcm_f32le(request.audioBase64)

    if audio.size < SAMPLE_RATE // 2:
        return {"text": "", "meta": {"provider": "gemma-hf", "skipped": "too_short"}}

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as audio_file:
        write_float32_wav(audio_file.name, audio)
        output = run_gemma(audio_file.name, request.targetLanguage)

    return {
        "text": extract_translation(output, request.targetLanguage),
        "meta": {
            "provider": "gemma-hf",
            "raw": output,
            "samples": int(audio.size),
        },
    }


def decode_pcm_f32le(audio_base64: str) -> np.ndarray:
    raw = base64.b64decode(audio_base64)
    audio = np.frombuffer(raw, dtype="<f4")
    return np.clip(audio.astype(np.float32, copy=False), -1.0, 1.0)


def write_float32_wav(path: str, audio: np.ndarray) -> None:
    # Python's wave module writes PCM integer WAV, so convert for broad decoder support.
    int16 = np.clip(audio * 32767.0, -32768, 32767).astype("<i2")

    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(int16.tobytes())


@lru_cache(maxsize=1)
def get_pipe():
    from transformers import GenerationConfig, pipeline

    model_id = os.environ.get("MODEL_ID", "google/gemma-4-E4B-it")
    pipe = pipeline(
        task="any-to-any",
        model=model_id,
        device_map=os.environ.get("DEVICE_MAP", "auto"),
        dtype=os.environ.get("MODEL_DTYPE", "auto"),
    )
    config = GenerationConfig.from_pretrained(model_id)
    config.max_new_tokens = int(os.environ.get("MAX_NEW_TOKENS", "96"))
    return pipe, {"generation_config": config}


def run_gemma(audio_path: str, target_language_code: str) -> str:
    pipe, gen_kwargs = get_pipe()
    source_language = os.environ.get("SOURCE_LANGUAGE", "English")
    target_language = language_name(target_language_code)
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Transcribe the following speech segment in {source_language}, "
                        f"then translate it into {target_language}. "
                        f"When formatting the answer, first output the transcription in {source_language}, "
                        f"then one newline, then output the string '{target_language}: ', "
                        f"then the translation in {target_language}. "
                        "If there is no speech, output an empty string."
                    ),
                },
                {"type": "audio", "audio": audio_path},
            ],
        }
    ]
    outputs = pipe(messages, return_full_text=False, generate_kwargs=gen_kwargs)
    return str(outputs[0].get("generated_text", "")).strip()


def extract_translation(output: str, target_language_code: str) -> str:
    target_language = language_name(target_language_code)
    pattern = re.compile(rf"{re.escape(target_language)}:\s*(.+)", re.IGNORECASE | re.DOTALL)
    match = pattern.search(output)

    if match:
        return clean_model_text(match.group(1))

    lines = [clean_model_text(line) for line in output.splitlines() if clean_model_text(line)]
    return lines[-1] if lines else ""


def clean_model_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("<turn|>", "")).strip()


def language_name(code: str) -> str:
    return LANGUAGES.get(code, code or "Czech")

