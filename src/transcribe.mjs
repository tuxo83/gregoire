/* STEP 1, THE TRANSCRIBER (a script, not an AI that writes): a recording in, its words out, each
 * passage with when it was said. An OpenAI-compatible speech-to-text service (Whisper), e.g. OVH AI
 * Endpoints: RECITS_STT_BASE_URL, RECITS_STT_MODEL (whisper-large-v3), RECITS_STT_API_KEY.
 * What it writes is the reference every later step is checked against: it is never rewritten. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* One recording → { source, language, segments: [{ start, end, text }] }. `fetchImpl` for the tests. */
export async function transcribe(file, env = process.env, { fetchImpl = globalThis.fetch } = {}) {
    const base = String(env.RECITS_STT_BASE_URL || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1').replace(/\/+$/, '');
    const key = String(env.RECITS_STT_API_KEY || '').trim();
    if (!key) throw new Error('RECITS_STT_API_KEY is missing');
    const form = new FormData();
    form.append('model', env.RECITS_STT_MODEL || 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    if (env.RECITS_LANG) form.append('language', env.RECITS_LANG);
    form.append('file', new Blob([readFileSync(file)]), basename(file));
    const r = await fetchImpl(`${base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) throw new Error(`speech-to-text answered ${r.status}`);
    const j = await r.json();
    const segments = (j.segments ?? [{ start: 0, end: 0, text: j.text ?? '' }]).map((s) => ({ start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: String(s.text ?? '').trim() })).filter((s) => s.text);
    return { source: basename(file), language: j.language ?? env.RECITS_LANG ?? null, segments };
}

/* Kept as JSON (for the steps after) and as plain text with times (for a person). */
export function keep(transcript, dir) {
    mkdirSync(dir, { recursive: true });
    const name = transcript.source.replace(/\.[^.]+$/, '');
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(transcript, null, 1)}\n`);
    writeFileSync(join(dir, `${name}.txt`), transcript.segments.map((s) => `[${mmss(s.start)}] ${s.text}`).join('\n') + '\n');
    return join(dir, `${name}.json`);
}
