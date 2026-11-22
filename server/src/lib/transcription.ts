import { env } from '../config/env';

/**
 * Transcribes audio using Groq's OpenAI-compatible Whisper endpoint.
 * Model: whisper-large-v3-turbo
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const file = new File([buffer], filename, { type: mimeType });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = response.statusText;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.error?.message || errorMessage;
    } catch {
      errorMessage = errorBody || errorMessage;
    }
    throw new Error(`Groq Whisper transcription failed (${response.status}): ${errorMessage}`);
  }

  const data = (await response.json()) as { text: string };
  return data.text ? data.text.trim() : '';
}
