# Local Piper TTS

Cross-platform local TTS runner for the PoC.

It exposes:

```http
POST /synthesize
```

with:

```json
{
  "text": "Ahoj světe",
  "language": "cs"
}
```

and returns:

```json
{
  "mimeType": "audio/wav",
  "audioBase64": "..."
}
```

## Install

```bash
cd local-tts
uv venv
uv pip install -r requirements.txt
```

## Model

Download a Piper voice model and its matching `.json` config, for example:

```bash
mkdir -p voices
curl -L \
  -o voices/cs_CZ-jirka-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx
curl -L \
  -o voices/cs_CZ-jirka-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx.json
```

Set:

```bash
PIPER_MODEL=voices/cs_CZ-jirka-medium.onnx
PIPER_CONFIG=voices/cs_CZ-jirka-medium.onnx.json
```

## Run

```bash
PIPER_MODEL=voices/cs_CZ-jirka-medium.onnx \
PIPER_CONFIG=voices/cs_CZ-jirka-medium.onnx.json \
uv run uvicorn piper_server:app --host 127.0.0.1 --port 8792
```

Then run the Node bridge with:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 \
TTS_PROVIDER=external \
TTS_URL=http://127.0.0.1:8792/synthesize \
npm run server
```

This is the preferred Win/Mac/Linux TTS shape. The macOS `say` provider remains available only as a convenient local smoke test.
