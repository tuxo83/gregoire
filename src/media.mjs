/* WHATEVER THE FAMILY SENDS: a voice message (WhatsApp .opus, iPhone .m4a), a dictaphone's .mp3 or .wav, a
 * video (.mp4, .mov, .mkv, .webm)... read by ffmpeg (RECITS_FFMPEG, else `ffmpeg` on the path) into one
 * sound, 16 kHz mono, then cut into parts of five minutes at most -- at the quietest moment near the end of
 * each, a pause rather than a word -- since speech-to-text takes a few minutes at a time. */
import { spawn } from 'node:child_process';

export const RATE = 16_000;
export const PART_MOST_S = 300;
export const PART_LEAST_S = 270;

/* Any recording → PCM 16 kHz 16-bit mono (a Buffer). */
export function soundOf(file, env = process.env, { spawnImpl = spawn } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawnImpl(env.RECITS_FFMPEG || 'ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const parts = []; let said = '';
        child.stdout.on('data', (d) => parts.push(d));
        child.stderr.on('data', (d) => { said = `${said}${d}`.slice(-400); });
        child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? 'ffmpeg is needed to read recordings (RECITS_FFMPEG)' : e.message)));
        child.on('close', (code) => {
            const pcm = Buffer.concat(parts);
            if (code !== 0 || pcm.length < 2) reject(new Error(`this file could not be read as a recording${said ? `: ${said.trim().split('\n').pop()}` : ''}`));
            else resolve(pcm.subarray(0, pcm.length & ~1));
        });
    });
}

/* Parts of PART_MOST_S at most, each ending at the quietest 20 ms between PART_LEAST_S and PART_MOST_S. */
export function partsOf(pcm, { least = PART_LEAST_S, most = PART_MOST_S } = {}) {
    const second = RATE * 2; const step = 640; const out = [];
    let at = 0;
    while (pcm.length - at > most * second) {
        let best = at + most * second; let quietest = Infinity;
        for (let i = at + least * second; i + step <= at + most * second; i += step) {
            let e = 0;
            for (let k = i; k < i + step; k += 2) { const v = pcm.readInt16LE(k); e += v * v; }
            if (e < quietest) { quietest = e; best = i + step / 2; }
        }
        best -= best % 2;
        out.push({ start: at / second, pcm: pcm.subarray(at, best) }); at = best;
    }
    out.push({ start: at / second, pcm: pcm.subarray(at) });
    return out;
}

/* A WAV file around PCM 16 kHz mono. */
export function wavOf(pcm) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8, 'latin1');
    h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36, 'latin1'); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}
