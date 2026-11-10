// Transcribe audios y describe imágenes con Gemini (REST). Cachea el resultado en <ruta>.txt.
import { readFile, writeFile } from 'node:fs/promises';

const PROMPTS = {
  audio: 'Transcribe este audio en el idioma en que se habla, sin traducir, tal cual. Si no se entiende, dilo.',
  imagen: 'Describe esta imagen en una línea en español. Si contiene texto importante, cópialo.',
};

export async function procesarMedio({
  tipo,
  ruta,
  mimetype,
  apiKey,
  model = 'gemini-3.1-flash-lite',
  fetchFn = fetch,
}) {
  const prompt = PROMPTS[tipo];
  if (!prompt) throw new Error(`tipo de medio no soportado: ${tipo}`);

  const rutaTxt = `${ruta}.txt`;
  try {
    return await readFile(rutaTxt, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  try {
    const datos = (await readFile(ruta)).toString('base64');
    // La clave va en cabecera, no en la URL, para que no aparezca en errores ni logs.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimetype, data: datos } }] }],
      }),
    });
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
    const json = await res.json();
    const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!texto) throw new Error('Gemini no devolvió texto');
    await writeFile(rutaTxt, texto);
    return texto;
  } catch (cause) {
    throw new Error('no se pudo procesar el medio', { cause });
  }
}
