import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transcribe, keep, mmss } from '../src/transcribe.mjs';
import { itemsOf, promptOf, extract } from '../src/extract.mjs';
import { checkItems, norm, keepAside } from '../src/check.mjs';
import { partsOf, wavOf, soundOf } from '../src/media.mjs';

const T = { source: 'tante-2026-10-13.wav', language: 'fr', segments: [
    { start: 0, end: 7.7, text: 'Cet été-là, en 1962, à la ferme de Saint-Aubin, Paul a sorti le tracteur tout seul pour la première fois.' },
    { start: 8.3, end: 10.5, text: 'Ma tante Jeanne riait de le voir si fier.' },
    { start: 74, end: 80, text: "L'hiver suivant, nous sommes partis vivre à Lyon, chez mon oncle Henri." },
] };
const item = (o) => ({ id: 'x-001', who: ['Paul'], when: 'été 1962', where: 'Saint-Aubin', what: 'le tracteur', words: 'Paul a sorti le tracteur tout seul', source: { file: T.source, start: 2 }, ...o });

test('the checker keeps an item whose exact words are there, near the time it gives; refuses the rest, saying why', () => {
    const { kept, refused } = checkItems([
        item(),
        item({ id: 'x-002', words: 'paul a SORTI le   tracteur — tout seul' }),                       // case, spaces, dash: still the same words
        item({ id: 'x-003', words: 'Paul a conduit le tracteur tout seul' }),                         // rephrased
        item({ id: 'x-004', words: 'nous sommes partis vivre à Lyon', source: { file: T.source, start: 3 } }), // there, but a minute later
        item({ id: 'x-005', what: '' }),                                                               // incomplete
        item({ id: 'x-006', source: { file: 'autre.wav', start: 0 } }),                                // no such transcript
        item({ id: 'x-001' }),                                                                         // the same id again
    ], [T]);
    assert.deepEqual(kept.map((k) => k.id), ['x-001', 'x-002']);
    assert.deepEqual(refused.map((r) => [r.item.id, r.why.split(':')[0].split(',')[0]]), [
        ['x-003', 'these exact words are not in the transcript'], ['x-004', 'these words are in the transcript'],
        ['x-005', 'missing'], ['x-006', 'no transcript autre.wav'], ['x-001', 'an item with this id was kept already'],
    ]);
    assert.equal(norm('« Bon » — l’été…'), "bon l'été");
});

test('the extractor: the prompt carries the times; a model answer becomes items with ids and sources; nonsense is dropped', async () => {
    assert.match(promptOf(T), /\[01:14\] L'hiver suivant/);
    const answer = 'Voici : {"items": [{"who": ["Paul"], "when": "été 1962", "where": "Saint-Aubin", "what": "premier tracteur", "words": "Paul a sorti le tracteur tout seul", "start": 0}, "rubbish"]}';
    const items = itemsOf(answer, T);
    assert.deepEqual(items, [{ id: 'tante-2026-10-13-001', who: ['Paul'], when: 'été 1962', where: 'Saint-Aubin', what: 'premier tracteur', words: 'Paul a sorti le tracteur tout seul', source: { file: T.source, start: 0 } }]);
    assert.deepEqual(itemsOf('no json at all', T), []);
    const fetchImpl = async (url, init) => { const body = JSON.parse(init.body); assert.equal(body.temperature, 0); return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] })); };
    assert.equal((await extract(T, { RECITS_API_KEY: 'k' }, { fetchImpl })).length, 1);
    await assert.rejects(extract(T, {}), /RECITS_API_KEY/);
});

test('the transcriber: any recording read as sound, sent as a form, its passages kept as JSON and as text with times', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recits-'));
    const audio = join(dir, 'oncle.m4a'); writeFileSync(audio, 'not read: soundImpl stands for ffmpeg');
    const fetchImpl = async (url, init) => {
        assert.match(url, /\/audio\/transcriptions$/); assert.ok(init.body instanceof FormData);
        assert.equal(init.body.get('response_format'), 'verbose_json');
        return new Response(JSON.stringify({ language: 'fr', segments: [{ start: 0.04, end: 3.2, text: ' Bonjour. ' }, { start: 65.5, end: 70, text: 'La ferme.' }, { start: 70, end: 71, text: '  ' }] }));
    };
    const t = await transcribe(audio, { RECITS_STT_API_KEY: 'k', RECITS_STT_BASE_URL: 'https://stt.example.org/v1' }, { fetchImpl, soundImpl: async () => Buffer.alloc(32_000 * 80) });
    assert.deepEqual(t, { source: 'oncle.m4a', language: 'fr', duration: 80, segments: [{ start: 0, end: 3.2, text: 'Bonjour.' }, { start: 65.5, end: 70, text: 'La ferme.' }] });
    keep(t, join(dir, 'transcripts'));
    assert.equal(readFileSync(join(dir, 'transcripts', 'oncle.txt'), 'utf8'), '[00:00] Bonjour.\n[01:05] La ferme.\n');
    assert.equal(mmss(3725), '62:05');
});

test('a long recording: parts of five minutes cut in a pause, times put back end to end, voices told apart per part', async () => {
    const pcm = Buffer.alloc(32_000 * 700);
    for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(3000 * Math.sin(i / 9), i);
    pcm.fill(0, 32_000 * 280, 32_000 * 280 + 6400);   /* a pause at 4 min 40 */
    const parts = partsOf(pcm);
    assert.ok(parts.every((p) => p.pcm.length <= 32_000 * 300));
    assert.ok(Math.abs(parts[1].start - 280.1) < 0.2, `cut in the pause (${parts[1].start})`);
    assert.equal(wavOf(Buffer.alloc(4)).length, 48);
    let n = 0;
    const fetchImpl = async (url, init) => {
        assert.equal(init.body.get('diarize'), 'true', 'OVH tells voices apart');
        n++;
        return new Response(JSON.stringify({ language: 'fr', diarization: [{ speaker: 0, start: 1, end: 3, text: `Partie ${n}, première voix.` }, { speaker: 1, start: 4, end: 6, text: 'Seconde voix.' }] }));
    };
    const t = await transcribe('/x/reunion.mp4', { RECITS_STT_API_KEY: 'k' }, { fetchImpl, soundImpl: async () => pcm });
    assert.equal(n, parts.length);
    assert.deepEqual(t.segments.slice(0, 3).map((s) => [s.start, s.speaker, s.text]), [[1, 'voix 1 (partie 1)', 'Partie 1, première voix.'], [4, 'voix 2 (partie 1)', 'Seconde voix.'], [Math.round((parts[1].start + 1) * 10) / 10, 'voix 1 (partie 2)', 'Partie 2, première voix.']]);
    keep(t, mkdtempSync(join(tmpdir(), 'recits-')));
});

test('a recording ffmpeg cannot read is said so; without ffmpeg, said what is missing', async () => {
    await assert.rejects(soundOf('/nope.mp3', { RECITS_FFMPEG: '/no/such/ffmpeg' }), /ffmpeg is needed/);
});

test('the mission: what falls outside it is set aside with why, never lost, and kept on request with its reason noted', () => {
    assert.match(promptOf(T, 'les souvenirs de la vie de Papa'), /^MISSION: les souvenirs de la vie de Papa\n/);
    const answer = '{"items": [{"who": ["Paul"], "what": "premier tracteur", "words": "Paul a sorti le tracteur tout seul", "start": 0, "inMission": true}, {"who": ["Henri"], "what": "départ pour Lyon", "words": "nous sommes partis vivre à Lyon", "start": 75, "inMission": false, "outside": "la vie professionnelle d\'Henri"}]}';
    const items = itemsOf(answer, T);
    const { kept, aside, refused } = checkItems(items, [T]);
    assert.deepEqual([kept.length, aside.length, refused.length], [1, 1, 0]);
    assert.equal(aside[0].outside, "la vie professionnelle d'Henri");
    keepAside(kept, aside, aside[0].id, '2026-11-01T02:00:00Z');
    assert.deepEqual([kept.length, aside.length], [2, 0]);
    assert.deepEqual(kept[1].keptOnRequest, { at: '2026-11-01T02:00:00Z', setAsideBecause: "la vie professionnelle d'Henri" });
    assert.throws(() => keepAside(kept, aside, 'nope'), /no item nope/);
});
