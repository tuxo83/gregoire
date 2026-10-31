# Grégoire, the archivist

An assistant that keeps the memories of a family -- told aloud, written, photographed -- and can
say exactly where each one comes from. It does not tell the story itself: it keeps the facts,
faithfully, and recites them when asked ("what happened in July 1997?"); writing the story is the
work of the assistant the family talks to.

- **Transcribes** a recording (speech-to-text with the time of each passage).
- **Lists what was said** as items: who, when, where, what, and the **exact words**, with the minute.
- **Checks each item word for word** against the transcript: not found, not kept -- nobody, no AI,
  can rewrite what was said.
- Works within a **mission** written in plain words ("keep the memories of Dad's life, and of
  Mum's"); what falls outside it is set aside, never lost, and kept on request.

## Why "Grégoire"

After **Grégoire de Tours** (Gregory of Tours, 6th century), the bishop who wrote the *History of
the Franks* (*Historia Francorum*): he gathered what people remembered and wrote it down so it
would not be lost, saying where he had it from. That is the job. The name is also easy to say and
to recognise by voice -- a first idea, Adso of Melk (the novice who writes his memories in Umberto
Eco's *The Name of the Rose*), was misheard by speech recognition ("Atzo").

## Use

```sh
RECITS_API_KEY=... RECITS_LANG=fr node bin/recits.mjs transcribe memories/aunt.m4a
node bin/recits.mjs extract transcripts/aunt.json
node bin/recits.mjs check items/aunt.json --transcripts transcripts
```

Speech-to-text and the model: any OpenAI-compatible service (OVH AI Endpoints by default:
`whisper-large-v3`, `Mistral-Small-3.2-24B-Instruct-2506`).

## Tests

```sh
npm test
```

MIT licence.
