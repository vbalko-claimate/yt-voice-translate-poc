# Custom Voice Training

This project can use any TTS provider that returns audio from text. For a fully local voice, the preferred path is a custom Piper voice.

## Dataset Requirements

Use audio you own or have explicit permission to use for training.

Recommended starting point:

- one speaker
- clean microphone recordings
- no music, reverb, clipping, or overlapping speech
- mono WAV
- consistent loudness
- 2-12 second segments
- exact transcript for each segment
- 2-3 hours for a rough experiment
- 5-10 hours for a usable voice
- 15+ hours for a stronger voice

Common structure:

```text
dataset/
  wavs/
    000001.wav
    000002.wav
  metadata.csv
```

`metadata.csv`:

```text
000001|Toto je první věta.
000002|Toto je druhá věta.
```

## Synthetic Teacher Data

Do not use ElevenLabs output, or output from any proprietary service, as training data unless its terms explicitly allow that use. ElevenLabs' current Prohibited Use Policy disallows using their services or output as input or datasets for training/fine-tuning ML or AI models.

Acceptable sources:

- your own recorded voice
- a voice actor contract that explicitly allows TTS model training
- public-domain or permissively licensed speech datasets
- synthetic TTS output only if the provider explicitly permits model training/fine-tuning from the output

## Pipeline

```text
recordings
-> denoise / normalize
-> split into short utterances
-> transcript cleanup
-> metadata.csv
-> Piper training / fine-tuning
-> export ONNX
-> local-tts/piper_server.py
```

## Evaluation

Keep a held-out test set that is never used for training. Test:

- numbers
- names
- Czech diacritics
- English technical terms inside Czech sentences
- short interjections
- long explanatory sentences
- YouTube-style informal speech

## Integration

Once trained, copy the exported model and config into `local-tts/voices/`:

```text
local-tts/voices/custom-cs.onnx
local-tts/voices/custom-cs.onnx.json
```

Run:

```bash
PIPER_MODEL=voices/custom-cs.onnx \
PIPER_CONFIG=voices/custom-cs.onnx.json \
uv run uvicorn piper_server:app --host 127.0.0.1 --port 8792
```

