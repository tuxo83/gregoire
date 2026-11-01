// A SCHOOL CASE, checked by construction (nobody listens to anything): two synthetic voices tell memories
// whose facts are known in advance -- family ones (within the mission) and a work one (outside it); the
// recording is made a voice message (.opus) and a video's sound (.m4a); then the real chain runs:
// transcribe (OVH) → extract (OVH model, with the mission) → check. Passes when every family fact is kept
// with its exact words, and the work fact is set aside, not lost.
//   RECITS_API_KEY=... RECITS_FFMPEG=... node tools/e2e.mjs <work dir>
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { transcribe } from '../src/transcribe.mjs';
import { extract } from '../src/extract.mjs';
import { checkItems, norm } from '../src/check.mjs';
import { wavOf } from '../src/media.mjs';

const dir = process.argv[2]; mkdirSync(dir, { recursive: true });
const sherpa = createRequire('/home/ubuntu/build/clv-box/')('sherpa-onnx-node');
const voice = (v) => { const d = `/home/ubuntu/build/voices/vits-piper-fr_FR-${v}`; return new sherpa.OfflineTts({ model: { vits: { model: `${d}/fr_FR-${v}.onnx`, tokens: `${d}/tokens.txt`, dataDir: `${d}/espeak-ng-data` }, numThreads: 1 }, maxNumSentences: 1 }); };
const A = voice('tom-medium'); const B = voice('siwis-medium');
const SCRIPT = [
    [B, 'Raconte-moi ton enfance à la ferme.'],
    [A, 'En mille neuf cent soixante-deux, à Saint-Aubin, mon père m\'a appris à conduire le tracteur.', 'famille', 'tracteur'],
    [B, 'Et ta mère, comment était-elle ?'],
    [A, 'Ma mère Suzanne chantait toujours en faisant le pain le samedi matin.', 'famille', 'suzanne'],
    [A, 'Plus tard, chez Renault, j\'ai dirigé l\'atelier de peinture pendant douze ans.', 'travail', 'atelier'],
    [B, 'Et ton mariage ?'],
    [A, 'Nous nous sommes mariés à Lyon en juin mille neuf cent soixante-dix.', 'famille', 'mariés'],
];
const pcm = [];
for (const [tts, text] of SCRIPT) {
    const a = tts.generate({ text, sid: 0, speed: 1 });
    const n = Math.floor(a.samples.length * 16000 / a.sampleRate); const b = Buffer.alloc(n * 2);
    for (let k = 0; k < n; k++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round((a.samples[Math.floor(k * a.sampleRate / 16000)] ?? 0) * 32767))), k * 2);
    pcm.push(b, Buffer.alloc(16000));
}
writeFileSync(`${dir}/souvenirs.wav`, wavOf(Buffer.concat(pcm)));
const ff = process.env.RECITS_FFMPEG;
execFileSync(ff, ['-y', '-loglevel', 'error', '-i', `${dir}/souvenirs.wav`, '-c:a', 'libopus', `${dir}/vocal-whatsapp.opus`]);
execFileSync(ff, ['-y', '-loglevel', 'error', '-i', `${dir}/souvenirs.wav`, '-c:a', 'aac', `${dir}/video-son.m4a`]);
const env = { ...process.env, RECITS_STT_API_KEY: process.env.RECITS_API_KEY, RECITS_LANG: 'fr', RECITS_MISSION: 'garder les souvenirs de la vie de famille de Papa (pas sa vie professionnelle)' };
let ok = true;
for (const file of ['vocal-whatsapp.opus', 'video-son.m4a']) {
    const t = await transcribe(`${dir}/${file}`, env);
    const items = await extract(t, env);
    const { kept, aside, refused } = checkItems(items, [t]);
    /* A fact is found by its key word in the exact words kept (numbers come back as figures: « 1962 »). */
    const has = (list, key) => list.some((x) => norm(x.words).includes(key));
    for (const [, text, kind, key] of SCRIPT.filter((x) => x[2])) {
        const where = has(kept, key) ? 'gardé' : has(aside, key) ? 'mis de côté' : 'absent';
        const want = kind === 'famille' ? 'gardé' : 'mis de côté';
        if (where !== want) ok = false;
        console.log(`${file} | ${kind} | ${where === want ? 'OK ' : 'NON'} ${where} | ${text.slice(0, 50)}…`);
    }
    if (process.env.SHOW) console.log(JSON.stringify({ kept: kept.map((x) => x.words), aside: aside.map((x) => [x.words, x.outside]) }, null, 1));
    console.log(`${file}: ${t.segments.length} passages, voix : ${[...new Set(t.segments.map((s) => s.speaker))].join(', ')} ; ${kept.length} gardés, ${aside.length} de côté, ${refused.length} refusés`);
}
console.log(ok ? 'CAS D\'ÉCOLE : RÉUSSI' : 'CAS D\'ÉCOLE : ÉCHEC');
process.exitCode = ok ? 0 : 1;
