let chunkIndex = 0;

export async function translateAudioChunk({ audio, mimeType, targetLanguage }) {
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
