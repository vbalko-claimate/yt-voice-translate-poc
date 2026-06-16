# YouTube Voice Translate

Open-source Chrome extension + local companion services for translated audio overlay on YouTube.

The project translates YouTube tab audio into spoken voice-over:

- capture audio from the active YouTube tab with `chrome.tabCapture`
- stream 16 kHz PCM chunks to a local process over WebSocket
- translate speech locally with Gemma 4 through `llama.cpp`
- keep the original tab audio audible through an `AudioContext`
- duck the original audio
- synthesize and play translated voice output over the video

By default the server uses a mock translator. For real local translation, run Gemma Q4_0 with `llama.cpp` and point the Node bridge at it with `LLAMA_CPP_URL`.

## Target Architecture

```text
YouTube tab audio
-> Chrome tabCapture
-> WebSocket chunks
-> local server
-> Gemma 4 audio-to-translated-text adapter
-> local Piper / ElevenLabs / platform TTS
-> translated voice overlay
```

## Quick Start

Install server dependencies:

```bash
npm install
```

Run the local server in mock mode:

```bash
npm run server
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension` directory.
5. Open a YouTube video.
6. Click the extension icon and press Start.

Mock mode speaks Czech test messages whenever audio chunks arrive. That confirms the extension can capture YouTube audio, stream it locally, and play an overlay voice.

## Real Local Translation

Recommended Q4_0 path:

```bash
brew install llama.cpp
HF_TOKEN=... uv run hf download google/gemma-4-E2B-it-qat-q4_0-gguf gemma-4-E2B_q4_0-it.gguf gemma-4-E2B-it-mmproj.gguf
llama-server \
  --model "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B_q4_0-it.gguf" \
  --mmproj "$HOME/.cache/huggingface/hub/models--google--gemma-4-E2B-it-qat-q4_0-gguf/snapshots/1894d1fc0a19d86697abd40483f5983c867df03f/gemma-4-E2B-it-mmproj.gguf" \
  --host 127.0.0.1 \
  --port 8791 \
  --ctx-size 4096 \
  --jinja \
  --reasoning off
```

In another terminal, run the Node bridge:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 npm run server
```

Then load the extension, open a YouTube video, and press Start. The browser captures YouTube tab audio as 16 kHz mono float32 PCM, sends 3-second chunks to local Gemma Q4_0, and speaks the translated text with browser TTS.

## TTS Providers

The extension popup can choose the TTS provider per session.

### Local Piper

Run the Piper server:

```bash
cd local-tts
uv venv
uv pip install -r requirements.txt
mkdir -p voices
curl -L -o voices/cs_CZ-jirka-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx
curl -L -o voices/cs_CZ-jirka-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx.json
PIPER_MODEL=voices/cs_CZ-jirka-medium.onnx PIPER_CONFIG=voices/cs_CZ-jirka-medium.onnx.json uv run uvicorn piper_server:app --host 127.0.0.1 --port 8792
```

Run the Node bridge with Piper:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 TTS_PROVIDER=external TTS_URL=http://127.0.0.1:8792/synthesize npm run server
```

In the extension popup, choose `Local Piper`.

### ElevenLabs

In the extension popup, choose `ElevenLabs`, enter your API key, click `Load voices`, choose a voice from the dropdown, then press Start. The API key is sent only to the local Node bridge for the active session; it is not written to extension storage or to the repository. Voice lookup is proxied through `POST /elevenlabs/voices` on the local bridge so the key is not placed in a URL.

The popup persists non-secret settings in `chrome.storage.local`. If `Remember key locally` is enabled, the ElevenLabs API key is encrypted with AES-GCM before being written to `chrome.storage.local`; the non-extractable WebCrypto key is kept in the extension's IndexedDB.

Recommended model choices:

- `Flash v2.5` for lowest latency.
- `Turbo v2.5` for balanced latency and quality.
- `Multilingual v2` for quality.

You can also configure ElevenLabs from the shell instead of the popup:

```bash
LLAMA_CPP_URL=http://127.0.0.1:8791 \
TTS_PROVIDER=elevenlabs \
ELEVENLABS_API_KEY=... \
ELEVENLABS_VOICE_ID=... \
ELEVENLABS_MODEL_ID=eleven_flash_v2_5 \
npm run server
```

### Platform Fallback

`TTS_PROVIDER=macos` uses `say` and is useful only as a macOS smoke test. `speechSynthesis` in the extension remains a last-resort fallback if the server does not return audio.

Alternative Hugging Face safetensors path:

Install and run the Gemma runner:

```bash
cd local-runner
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
MODEL_ID=google/gemma-4-E4B-it uvicorn gemma_hf_server:app --host 127.0.0.1 --port 8790
```

In another terminal, run the Node bridge:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

Gemma model access may require accepting the Hugging Face model license before the first download.

## Replacing The Mock With Gemma

Implement the adapter in `server/src/translator.js`.

The intended contract is:

```js
async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
  return { text: "translated text to speak" };
}
```

For a real on-device setup, run Gemma in a local companion process and call it from this adapter. Keep the extension unchanged.

To point the PoC server at any local model runner:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

The runner endpoint should accept:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/pcm;rate=16000;channels=1;format=f32le",
  "targetLanguage": "cs"
}
```

and return:

```json
{
  "text": "prelozeny text"
}
```

See `docs/LOCAL_INFERENCE.md` for the intended local inference plan.

## Voice Training

Do not train or fine-tune a local model on ElevenLabs output unless you have explicit permission from ElevenLabs for that use. Their current Prohibited Use Policy disallows using their services or output as input or datasets for training/fine-tuning ML or AI models.

For a custom local voice, use recordings you own or have explicit rights to use for model training. A practical Piper voice dataset starts with clean single-speaker WAV segments plus transcripts; see `docs/VOICE_TRAINING.md`.

## Roadmap

- Measure real YouTube latency across translation and TTS providers.
- Add streaming TTS playback instead of one audio file per translated chunk.
- Add provider auto-detection for macOS, Windows, and Linux.
- Add a first-class voice selector in the extension popup.
- Improve chunking with VAD instead of fixed 3-second windows.
- Document and automate custom Piper voice training.
