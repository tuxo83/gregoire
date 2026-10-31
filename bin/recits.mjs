#!/usr/bin/env node
/* GRÉGOIRE, THE ARCHIVIST -- from voices to a story, and nobody rewrites what was said.
 * (Named after Grégoire de Tours, who wrote down what people remembered so it would not be lost: see README.)
 *   recits transcribe AUDIO... [--out transcripts]      step 1 (speech-to-text)
 *   recits extract TRANSCRIPT.json... [--out items]     step 2 (an AI lists the items)
 *   recits check ITEMS.json... --transcripts DIR [--out kept]   step 3 (exact words, or refused)
 * The storyteller (step 4) is an assistant given the kept items, read-only. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { transcribe, keep } from '../src/transcribe.mjs';
import { extract } from '../src/extract.mjs';
import { checkItems } from '../src/check.mjs';

export const VERSION = '0.1.0';
const [verb, ...rest] = process.argv.slice(2);
const opt = (name, d) => { const i = rest.indexOf(name); if (i < 0) return d; const v = rest[i + 1]; rest.splice(i, 2); return v; };
const env = { ...process.env, RECITS_STT_API_KEY: process.env.RECITS_STT_API_KEY || process.env.RECITS_API_KEY };

async function main() {
    if (verb === 'transcribe') {
        const out = opt('--out', 'transcripts');
        for (const f of rest) { const t = await transcribe(f, env); console.log(`${keep(t, out)}  ${t.segments.length} passages`); }
    } else if (verb === 'extract') {
        const out = opt('--out', 'items'); mkdirSync(out, { recursive: true });
        for (const f of rest) { const t = JSON.parse(readFileSync(f, 'utf8')); const items = await extract(t, env); const p = join(out, basename(f)); writeFileSync(p, `${JSON.stringify(items, null, 1)}\n`); console.log(`${p}  ${items.length} items`); }
    } else if (verb === 'check') {
        const dir = opt('--transcripts', 'transcripts'); const out = opt('--out', 'kept'); mkdirSync(out, { recursive: true });
        const transcripts = readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
        const items = rest.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
        const { kept, refused } = checkItems(items, transcripts);
        writeFileSync(join(out, 'items.json'), `${JSON.stringify(kept, null, 1)}\n`);
        writeFileSync(join(out, 'refused.json'), `${JSON.stringify(refused, null, 1)}\n`);
        console.log(`${kept.length} kept, ${refused.length} refused${refused.length ? `:\n${refused.map((r) => `  ${r.item?.id ?? '?'}: ${r.why}`).join('\n')}` : ''}`);
    } else if (verb === '--version') console.log(VERSION);
    else { console.error('recits transcribe | extract | check   (see the top of bin/recits.mjs)'); process.exitCode = 64; }
}
main().catch((e) => { console.error(`récits: ${e.message}`); process.exitCode = 1; });
