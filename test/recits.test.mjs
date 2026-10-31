import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transcribe, keep, mmss } from '../src/transcribe.mjs';
import { itemsOf, promptOf, extract } from '../src/extract.mjs';
import { checkItems, norm } from '../src/check.mjs';

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

test('the transcriber: a recording sent as a form, its passages kept as JSON and as text with times', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recits-'));
    const audio = join(dir, 'oncle.wav'); writeFileSync(audio, Buffer.from('RIFF....WAVE'));
    const fetchImpl = async (url, init) => {
        assert.match(url, /\/audio\/transcriptions$/); assert.ok(init.body instanceof FormData);
        assert.equal(init.body.get('response_format'), 'verbose_json');
        return new Response(JSON.stringify({ language: 'fr', segments: [{ start: 0.04, end: 3.2, text: ' Bonjour. ' }, { start: 65.5, end: 70, text: 'La ferme.' }, { start: 70, end: 71, text: '  ' }] }));
    };
    const t = await transcribe(audio, { RECITS_STT_API_KEY: 'k' }, { fetchImpl });
    assert.deepEqual(t, { source: 'oncle.wav', language: 'fr', segments: [{ start: 0, end: 3.2, text: 'Bonjour.' }, { start: 65.5, end: 70, text: 'La ferme.' }] });
    keep(t, join(dir, 'transcripts'));
    assert.equal(readFileSync(join(dir, 'transcripts', 'oncle.txt'), 'utf8'), '[00:00] Bonjour.\n[01:05] La ferme.\n');
    assert.equal(mmss(3725), '62:05');
});
