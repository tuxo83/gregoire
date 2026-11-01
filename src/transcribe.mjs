/* STEP 1, THE TRANSCRIBER (a script, not an AI that writes): a recording in, its words out, each
 * passage with when it was said and WHO said it (voices told apart when the service can: OVH's diarize).
 * Any format (media.mjs: ffmpeg), any length (parts of five minutes). An OpenAI-compatible speech-to-text
 * service (Whisper), e.g. OVH AI Endpoints: RECITS_STT_BASE_URL, RECITS_STT_MODEL (whisper-large-v3),
 * RECITS_STT_API_KEY. What it writes is the reference every later step is checked against: never rewritten. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { soundOf, partsOf, wavOf } from './media.mjs';

export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const DIARIZES = /^https:\/\/oai\.endpoints\.kepler\.ai\.cloud\.ovh\.net\//;

/* One part (a WAV) → its passages, times from the part's start. */
export async function transcribePart(wav, env = process.env, { fetchImpl = globalThis.fetch, name = 'part.wav' } = {}) {
    const base = String(env.RECITS_STT_BASE_URL || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1').replace(/\/+$/, '');
    const key = String(env.RECITS_STT_API_KEY || '').trim();
    if (!key) throw new Error('RECITS_STT_API_KEY is missing');
    const form = new FormData();
    form.append('model', env.RECITS_STT_MODEL || 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    if (DIARIZES.test(`${base}/`)) form.append('diarize', 'true');
    if (env.RECITS_LANG) form.append('language', env.RECITS_LANG);
    form.append('file', new Blob([wav], { type: 'audio/wav' }), name);
    let r;
    for (let attempt = 0; ; attempt++) {   /* the service fails now and then: tried again, twice */
        r = await fetchImpl(`${base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
        if (r.ok || attempt >= 2 || r.status === 400 || r.status === 413) break;
        await new Promise((ok) => setTimeout(ok, 1000 * (attempt + 1)));
    }
    if (!r.ok) throw new Error(`speech-to-text answered ${r.status}`);
    const j = await r.json();
    const voices = Array.isArray(j.diarization) && j.diarization.length;
    const raw = voices ? j.diarization : (j.segments ?? [{ start: 0, end: 0, text: j.text ?? '' }]);
    return {
        language: j.language ?? env.RECITS_LANG ?? null,
        segments: raw.map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim(), ...(voices ? { voice: Number(s.speaker) || 0 } : {}) })).filter((s) => s.text),
    };
}

/* One recording → { source, language, duration, segments: [{ start, end, text, speaker? }] }.
   Voices are numbered per part of five minutes by the service: "voix 1 (partie 2)" -- a person may change
   number from one part to the next, which the transcript says rather than guesses. */
export async function transcribe(file, env = process.env, { fetchImpl = globalThis.fetch, soundImpl = soundOf } = {}) {
    const pcm = await soundImpl(file, env);
    const parts = partsOf(pcm);
    const segments = []; let language = null;
    for (const [i, part] of parts.entries()) {
        const t = await transcribePart(wavOf(part.pcm), env, { fetchImpl, name: `${basename(file)}-${i + 1}.wav` });
        language ??= t.language;
        for (const s of t.segments) {
            segments.push({
                start: Math.round((part.start + s.start) * 10) / 10, end: Math.round((part.start + s.end) * 10) / 10, text: s.text,
                ...(s.voice !== undefined ? { speaker: `voix ${s.voice + 1}${parts.length > 1 ? ` (partie ${i + 1})` : ''}` } : {}),
            });
        }
    }
    return { source: basename(file), language, duration: Math.round(pcm.length / 32_000), segments };
}

/* Kept as JSON (for the steps after) and as plain text with times and voices (for a person). */
export function keep(transcript, dir) {
    mkdirSync(dir, { recursive: true });
    const name = transcript.source.replace(/\.[^.]+$/, '');
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(transcript, null, 1)}\n`);
    writeFileSync(join(dir, `${name}.txt`), transcript.segments.map((s) => `[${mmss(s.start)}]${s.speaker ? ` ${s.speaker} :` : ''} ${s.text}`).join('\n') + '\n');
    return join(dir, `${name}.json`);
}
