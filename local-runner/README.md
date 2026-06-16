# Local Gemma Runner

This runner is the on-device model process for the PoC.

It accepts the PCM chunks sent by the Chrome extension through the Node bridge:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/pcm;rate=16000;channels=1;format=f32le",
  "targetLanguage": "cs"
}
```

and returns:

```json
{
  "text": "prelozeny text",
  "meta": {
    "provider": "gemma-hf"
  }
}
```

## Install

Use a Python environment with PyTorch support for your machine:

```bash
cd local-runner
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## Run

```bash
MODEL_ID=google/gemma-4-E4B-it uvicorn gemma_hf_server:app --host 127.0.0.1 --port 8790
```

Then run the Node bridge in the project root:

```bash
GEMMA_TRANSLATOR_URL=http://127.0.0.1:8790/translate npm run server
```

Load the Chrome extension, open a YouTube video, and press Start.

## Notes

- The first request loads the model and can take a while.
- Gemma model access may require accepting the model license on Hugging Face before download.
- The browser currently speaks the translated text using `speechSynthesis`; replacing that with local streaming TTS is the next step.

