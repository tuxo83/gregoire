/* STEP 3, THE CHECKER (a script): an item is kept only if its exact words are in the transcript it
 * names, near the time it gives. Not found: refused, and said why. This is what keeps a fact a fact:
 * no AI after this point can change what was said. */

/* Compared loosely only on what speech-to-text varies on: case, spaces, apostrophes and quotes,
   dashes, punctuation at the edges. Every word must be there, in order. */
export const norm = (t) => String(t ?? '').toLowerCase().normalize('NFC').replace(/[’‘`´]/g, "'").replace(/[«»“”"]/g, '').replace(/[‐-―-]/g, ' ').replace(/[.,;:!?…()]/g, ' ').replace(/\s+/g, ' ').trim();

const FIELDS = ['id', 'who', 'what', 'words', 'source'];
const NEAR_S = 30; /* its time may be off by this much */

export function checkItems(items, transcripts) {
    const kept = []; const refused = [];
    const by = new Map(transcripts.map((t) => [t.source, t]));
    const seen = new Set();
    for (const item of items) {
        const missing = FIELDS.filter((f) => item?.[f] === undefined || item?.[f] === '' || (Array.isArray(item[f]) && !item[f].length));
        if (missing.length) { refused.push({ item, why: `missing: ${missing.join(', ')}` }); continue; }
        if (seen.has(item.id)) { refused.push({ item, why: 'an item with this id was kept already' }); continue; }
        const t = by.get(item.source.file);
        if (!t) { refused.push({ item, why: `no transcript ${item.source.file}` }); continue; }
        const words = norm(item.words);
        if (words.split(' ').length < 3) { refused.push({ item, why: 'exact words: three at least' }); continue; }
        /* The words, within the passages around the time it gives (a quote may span two). */
        const at = Number(item.source.start ?? NaN);
        const near = Number.isFinite(at) ? t.segments.filter((s) => s.end >= at - NEAR_S && s.start <= at + NEAR_S) : t.segments;
        const found = norm(near.map((s) => s.text).join(' ')).includes(words) ? 'near' : norm(t.segments.map((s) => s.text).join(' ')).includes(words) ? 'elsewhere' : null;
        if (!found) { refused.push({ item, why: 'these exact words are not in the transcript' }); continue; }
        if (found === 'elsewhere') { refused.push({ item, why: `these words are in the transcript, but not near ${item.source.start} s` }); continue; }
        seen.add(item.id); kept.push(item);
    }
    return { kept, refused };
}
