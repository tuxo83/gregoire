/* STEP 2, THE EXTRACTOR (an AI): a transcript in, a list of things that were said out -- one item
 * each: who, when, where, what, and the EXACT words it comes from (copied, never rephrased), with
 * the time they were said. It writes items only; the checker (step 3) keeps those whose words are
 * really in the transcript. Any OpenAI-compatible chat model: RECITS_BASE_URL, RECITS_MODEL,
 * RECITS_API_KEY (OVH AI Endpoints by default). */
import { mmss } from './transcribe.mjs';

export const SYSTEM = `You read the transcript of a recording where somebody tells memories. You list the things that were said, as JSON, and nothing else.
Each item: {"who": [people concerned, with their tie to the teller when said], "when": "the time it is about, as said (e.g. summer 1962)", "where": "the place, as said", "what": "the thing, in a few words", "words": "the EXACT words of the transcript it comes from, copied letter for letter, 8 to 40 words", "start": the second where those words begin (from the [mm:ss] marks)}.
Write "who", "when", "where" and "what" in the language of the transcript. Never rephrase "words": copy them. Leave "when" or "where" empty when not said. Do not invent anything.
Answer ONLY: {"items": [ ... ]}`;

export function promptOf(transcript) {
    return `Recording: ${transcript.source}\nTranscript:\n${transcript.segments.map((s) => `[${mmss(s.start)}] ${s.text}`).join('\n')}`;
}

/* The model's answer → items with an id and their source; anything malformed is dropped here,
   anything unfaithful by the checker. */
export function itemsOf(answer, transcript) {
    const raw = /\{[\s\S]*\}/.exec(String(answer ?? ''))?.[0];
    let list = [];
    try { list = JSON.parse(raw ?? '{}').items ?? []; } catch { list = []; }
    const name = transcript.source.replace(/\.[^.]+$/, '');
    return list.filter((x) => x && typeof x === 'object').map((x, i) => ({
        id: `${name}-${String(i + 1).padStart(3, '0')}`,
        who: (Array.isArray(x.who) ? x.who : [x.who]).map((w) => String(w ?? '').trim()).filter(Boolean),
        when: String(x.when ?? '').trim(), where: String(x.where ?? '').trim(), what: String(x.what ?? '').trim(),
        words: String(x.words ?? '').trim(),
        source: { file: transcript.source, start: Number.isFinite(Number(x.start)) ? Number(x.start) : null },
    }));
}

export async function extract(transcript, env = process.env, { fetchImpl = globalThis.fetch } = {}) {
    const base = String(env.RECITS_BASE_URL || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1').replace(/\/+$/, '');
    const key = String(env.RECITS_API_KEY || '').trim();
    if (!key) throw new Error('RECITS_API_KEY is missing');
    const r = await fetchImpl(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: env.RECITS_MODEL || 'Mistral-Small-3.2-24B-Instruct-2506', temperature: 0, max_tokens: 4000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: promptOf(transcript) }] }) });
    if (!r.ok) throw new Error(`the model answered ${r.status}`);
    const j = await r.json();
    return itemsOf(j.choices?.[0]?.message?.content, transcript);
}
