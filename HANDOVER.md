# Handover

## Project

Repo: https://github.com/vbalko-claimate/yt-voice-translate-poc

Local path:

```text
/Users/vladimirbalko/development/ai/yt-voice-translate-poc
```

Purpose: Chrome extension + local companion stack for translated YouTube audio voice-over.

## Current Architecture

```text
Chrome extension
-> tabCapture YouTube audio
-> downsample to 16 kHz mono Float32 PCM
-> WebSocket to local Node bridge
-> Gemma 4 Q4 via llama.cpp: audio -> translated text
-> TTS provider: Piper / ElevenLabs / fallback
-> extension plays returned audio overlay
```

## Running Services

At last check:

- Gemma Q4 `llama-server`: `http://127.0.0.1:8791`
- Piper TTS: `http://127.0.0.1:8792`
- Node bridge: `ws://127.0.0.1:8787`

## Gemma Model Setup

Downloaded and working:

- `google/gemma-4-E2B-it-qat-q4_0-gguf`
- `gemma-4-E2B_q4_0-it.gguf`
- `gemma-4-E2B-it-mmproj.gguf`

Cache size is about `4.0 GB`. It runs via `llama.cpp` on Apple Metal. Audio input works through `mmproj`.

Important: start with `--reasoning off`; otherwise the model emits reasoning content.

Start command:

```bash
llama-server \
  --model "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B_q4_0-it.gguf" \
  --mmproj "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B-it-mmproj.gguf" \
  --host 127.0.0.1 \
  --port 8791 \
  --ctx-size 4096 \
  --jinja \
  --reasoning off
```

## Node Bridge

Start with local Gemma + Piper:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 \
TTS_PROVIDER=external \
TTS_URL=http://127.0.0.1:8792/synthesize \
npm run server
```

Endpoints:

- WebSocket: `ws://127.0.0.1:8787`
- Health: `GET /health`
- ElevenLabs voice lookup: `POST /elevenlabs/voices`

## TTS Providers

Implemented providers:

- `external`: local Piper server
- `elevenlabs`: cloud ElevenLabs TTS
- `macos`: `say`, mostly smoke-test fallback
- `none`: text/no audio path

Piper:

```bash
cd local-tts
uv venv
uv pip install -r requirements.txt
PIPER_MODEL=voices/cs_CZ-jirka-medium.onnx \
PIPER_CONFIG=voices/cs_CZ-jirka-medium.onnx.json \
uv run uvicorn piper_server:app --host 127.0.0.1 --port 8792
```

Downloaded Piper voice:

- `local-tts/voices/cs_CZ-jirka-medium.onnx`
- `local-tts/voices/cs_CZ-jirka-medium.onnx.json`

The `local-tts/voices/` directory is ignored by git.

ElevenLabs:

- selectable in extension UI
- API key entered in popup
- voice list loaded via local Node bridge
- key is not placed in URL
- key is not echoed in ready response
- optional `Remember key locally`

## Extension UI

Popup supports:

- server URL
- target language
- original volume
- voice volume
- TTS provider
- ElevenLabs API key
- remember key locally
- Load voices button
- voice dropdown
- model dropdown

Settings persistence:

- `chrome.storage.local` for normal settings
- API key persisted only if checkbox is enabled
- API key encrypted with AES-GCM
- ciphertext in `chrome.storage.local`
- non-extractable WebCrypto key in extension IndexedDB

This is not equivalent to a native OS keychain.

Manifest permissions:

- `activeTab`
- `offscreen`
- `storage`
- `tabCapture`

Reload unpacked extension after manifest/UI changes.

## Important Files

- `extension/manifest.json`
- `extension/background.js`
- `extension/offscreen/offscreen.js`
- `extension/popup/popup.html`
- `extension/popup/popup.js`
- `server/src/server.js`
- `server/src/translator.js`
- `server/src/tts.js`
- `local-tts/piper_server.py`
- `local-runner/gemma_hf_server.py`
- `docs/VOICE_TRAINING.md`
- `docs/LOCAL_INFERENCE.md`
- `SECURITY.md`
- `CONTRIBUTING.md`

## Validation Already Done

Passed:

```bash
npm run check
node --check extension/popup/popup.js
node --check extension/background.js
node --check extension/offscreen/offscreen.js
git diff --check
```

Tested:

- `llama.cpp` receives audio request and returns valid response
- silence returns empty text
- WebSocket PCM chunk -> Node -> llama.cpp works
- Piper `/synthesize` returns valid WAV
- WebSocket mock -> Piper returns `speech.audioBase64`
- ElevenLabs `/elevenlabs/voices` local proxy:
  - `/health` works
  - `OPTIONS` works
  - missing API key returns expected error
- API key is not echoed back in ready response

## Legal / Policy Notes

Do not train Piper/local models on ElevenLabs generated output unless there is explicit permission. ElevenLabs current Prohibited Use Policy disallows using services/output as input or datasets for training/fine-tuning ML/AI models.

Custom local voice path should use:

- own recordings
- voice actor with explicit model-training rights
- permissively licensed datasets
- provider output only if license explicitly allows training

## Known Weaknesses / Next Work

Main next tasks:

- Test with live YouTube video end-to-end in Chrome and measure latency.
- Improve chunking: fixed 3s chunks should become VAD-based chunks.
- Add streaming TTS playback instead of waiting for full audio response per chunk.
- Add provider auto-detection per OS.
- Improve voice selector UX and maybe cache ElevenLabs voices with refresh timestamp.
- Add a proper app/project name, logo, screenshots.
- Rename repo from `yt-voice-translate-poc` when ready.
- Consider replacing `ScriptProcessorNode` with `AudioWorklet`.
- Add CI for JS/Python syntax checks.
- Add issue templates.
- Build a real custom Piper voice training workflow.

## Latest Git State Before This File

Last pushed commit before this handover file:

```text
bbe0aed Persist extension settings securely
```

