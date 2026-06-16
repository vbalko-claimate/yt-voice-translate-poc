let chunkIndex = 0;

export async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
  if (process.env.LLAMA_CPP_URL) {
    return translateWithLlamaCpp({
      audio,
      mimeType,
      targetLanguage,
      url: process.env.LLAMA_CPP_URL
    });
  }

  if (process.env.GEMMA_TRANSLATOR_URL) {
    return translateWithLocalRunner({
      audio,
      mimeType,
      targetLanguage,
      url: process.env.GEMMA_TRANSLATOR_URL
    });
  }

  chunkIndex += 1;

  return {
    text: `Test prekladu ${chunkIndex}. Prisel audio chunk ${Math.round(audio.length / 1024)} kilobajtu. Cilovy jazyk je ${targetLanguage}.`,
    meta: {
      chunkIndex,
      mimeType,
      bytes: audio.length,
      provider: "mock"
    }
  };
}

async function translateWithLlamaCpp({ audio, mimeType, targetLanguage, url }) {
  if (!mimeType.includes("audio/pcm") || !mimeType.includes("f32le")) {
    throw new Error(`LLAMA_CPP_URL expects 16 kHz mono f32le PCM, got ${mimeType}`);
  }

  const wavBase64 = pcmF32leToWavBase64(audio);
  const response = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.LLAMA_CPP_MODEL || "gemma-q4",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Translate the spoken speech in this audio segment into ${languageName(targetLanguage)}.`,
                "Output only the translated text for spoken voice-over.",
                "If there is no speech, music only, or noise only, output an empty string."
              ].join(" ")
            },
            {
              type: "input_audio",
              input_audio: {
                data: wavBase64,
                format: "wav"
              }
            }
          ]
        }
      ],
      temperature: 0,
      max_tokens: Number(process.env.MAX_TRANSLATION_TOKENS || 96)
    })
  });

  if (!response.ok) {
    throw new Error(`llama.cpp server returned HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim() || "";

  return {
    text,
    meta: {
      provider: "llama.cpp",
      model: payload.model,
      usage: payload.usage
    }
  };
}

async function translateWithLocalRunner({ audio, mimeType, targetLanguage, url }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      audioBase64: audio.toString("base64"),
      mimeType,
      targetLanguage
    })
  });

  if (!response.ok) {
    throw new Error(`Local Gemma runner returned HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();

  return {
    text: payload.text || "",
    meta: payload.meta || {}
  };
}

function pcmF32leToWavBase64(audio) {
  const sampleRate = 16000;
  const samples = new Float32Array(audio.buffer, audio.byteOffset, audio.byteLength / 4);
  const pcm = Buffer.alloc(samples.length * 2);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, index * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString("base64");
}

function languageName(code) {
  const languages = {
    cs: "Czech",
    sk: "Slovak",
    de: "German",
    en: "English"
  };

  return languages[code] || code || "Czech";
}
