# Contributing

Thanks for helping improve YouTube Voice Translate.

## Development

Run checks before opening a PR:

```bash
npm run check
```

Keep changes scoped. The project has three separate surfaces:

- `extension/` captures and plays audio in Chrome.
- `server/` bridges WebSocket audio chunks to translation and TTS providers.
- `local-runner/` and `local-tts/` host optional local model services.

## Secrets

Do not commit API keys, model access tokens, generated audio datasets, or private voice recordings.

Use environment variables or the extension popup for session-only API keys.

## Voice Data

Only contribute voice training examples or datasets if you have the rights to use and redistribute them for model training.

