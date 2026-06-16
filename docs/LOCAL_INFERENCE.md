# Local Inference Plan

The model should run in a local companion process, not inside the Chrome extension.

## Why

Chrome extension code is good at capture and playback, but it is a poor place to host a multi-GB model:

- model files are too large for normal extension distribution
- WebGPU support and memory behavior vary by machine
- updating model/runtime code would require extension updates
- native runtimes can use Metal, CUDA, CPU threads, memory mapping, and model caches

The extension should only do:

```text
tabCapture -> WebSocket audio chunks -> receive translated text/audio -> overlay playback
```

The local companion should do:

```text
audio chunk -> Gemma audio-to-translated-text -> TTS -> output
```

## First Real Runner

Start with a local HTTP adapter behind the existing WebSocket server:

```text
extension
-> server/src/server.js
-> server/src/translator.js
-> local Gemma runner
```

`translator.js` keeps this contract:

```js
async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
  return { text: "translated text to speak" };
}
```

The runner can be swapped later without touching the extension.

## Candidate Runtimes

Preferred order for PoC:

1. Python runner using Google's recommended Gemma stack once model access and audio examples are confirmed.
2. Native runner such as llama.cpp / GGUF if Gemma 4 audio support is available there.
3. Ollama only if it exposes the exact Gemma audio input path; otherwise it is better for text-only LLMs.

For this project, the runner must accept raw browser audio chunks or decoded PCM and return translated text quickly. TTS can stay in the extension via `speechSynthesis` for the first PoC.

## Latency Target

The initial goal is not perfect dubbing. It is a live interpreter:

- audio chunk size: 2-4 seconds
- first translated speech: under 6 seconds
- stable buffer: 1-2 chunks
- original audio ducked to 10-25%

If this feels usable, replace browser TTS with local streaming TTS.

## Gemma Prompt Shape

For each chunk:

```text
Translate the spoken English in this audio segment into Czech.
Output only natural Czech suitable for spoken voice-over.
Do not add explanations.
Use the previous context only to resolve pronouns and terminology.
```

The runner should keep a small rolling context of previous translated chunks, but should not resend the full video history.

