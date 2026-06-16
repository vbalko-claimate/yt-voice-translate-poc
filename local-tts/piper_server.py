import base64
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


class SynthesizeRequest(BaseModel):
    text: str
    language: str = "cs"


app = FastAPI(title="YouTube Voice Translate Piper TTS")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": os.environ.get("PIPER_MODEL", ""),
    }


@app.post("/synthesize")
def synthesize(request: SynthesizeRequest) -> dict[str, Any]:
    text = request.text.strip()

    if not text:
        return {"mimeType": "audio/wav", "audioBase64": "", "meta": {"skipped": "empty"}}

    model = os.environ.get("PIPER_MODEL")
    config = os.environ.get("PIPER_CONFIG")
    executable = os.environ.get("PIPER_BIN", "piper")

    if not model:
        raise HTTPException(status_code=500, detail="PIPER_MODEL is required.")

    if not Path(model).exists():
        raise HTTPException(status_code=500, detail=f"PIPER_MODEL does not exist: {model}")

    if config and not Path(config).exists():
        raise HTTPException(status_code=500, detail=f"PIPER_CONFIG does not exist: {config}")

    with tempfile.NamedTemporaryFile(suffix=".wav") as output:
        command = [
            executable,
            "--model",
            model,
            "--output_file",
            output.name,
        ]

        if config:
            command.extend(["--config", config])

        try:
            subprocess.run(
                command,
                input=text,
                text=True,
                check=True,
                timeout=float(os.environ.get("PIPER_TIMEOUT_SECONDS", "20")),
                capture_output=True,
            )
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=500,
                detail="Piper executable not found. Install piper or set PIPER_BIN.",
            ) from error
        except subprocess.CalledProcessError as error:
            raise HTTPException(
                status_code=500,
                detail=error.stderr.strip() or error.stdout.strip() or str(error),
            ) from error

        audio = Path(output.name).read_bytes()

    return {
        "mimeType": "audio/wav",
        "audioBase64": base64.b64encode(audio).decode("ascii"),
        "meta": {
            "provider": "piper",
            "bytes": len(audio),
        },
    }

