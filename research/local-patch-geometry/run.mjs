// node run.mjs --via ollama|hosted --model <id> [--kinds patch,scene,lsystem,sdf] [--out out/x.jsonl] [--from N --to M]
// One model, every wish of the chosen kinds, up to 3 tries each; one JSON line per wish. Resumes: a wish
// already in the out file is skipped.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { WISHES } from './wishes.mjs';
import { KINDS, parseJson, stripFences, sdfStatic } from './kinds.mjs';
import { openGpu } from './gpu.mjs';
import './points.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const via = arg('via', 'ollama');
const model = arg('model');
const kinds = arg('kinds', 'patch,scene,lsystem,sdf').split(',');
const out = arg('out', `out/${model.replace(/[^a-z0-9.]+/gi, '_')}.jsonl`);
const OLLAMA = arg('ollama', 'http://127.0.0.1:11435');
const HOSTED = 'https://wish.positron.studio/wish/code';
const TIMEOUT = Number(arg('timeout', 180)) * 1000;
const TRIES = 3;
const SCHEMA = arg('schema', 'on') === 'on';

const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.kind}:${j.i}`; }) : []);

const RETRY = (err) => `That answer was refused: ${err}\nWrite the whole answer again, fixed.`;

async function askOllama(kind, wish, previous, error) {
  const K = KINDS[kind];
  const messages = [{ role: 'system', content: K.system }, { role: 'user', content: wish }];
  if (previous) messages.push({ role: 'assistant', content: previous }, { role: 'user', content: RETRY(error) });
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), body: JSON.stringify({
    model, messages, stream: false, think: false, keep_alive: '30m',
    ...(K.json && SCHEMA ? { format: K.schema } : {}),
    options: { temperature: 0.3, num_predict: 1500, num_ctx: 8192 },
  }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`ollama ${r.status}: ${j.error}`);
  return { text: j.message?.content || '', ms: Date.now() - t0, tokensIn: j.prompt_eval_count, tokensOut: j.eval_count,
    evalTps: j.eval_count && j.eval_duration ? +(j.eval_count / (j.eval_duration / 1e9)).toFixed(1) : null, thinking: (j.message?.thinking || '').length };
}

let lastHosted = 0;
async function askHosted(kind, wish, previous, error) {
  const K = KINDS[kind];
  const contract = `${K.system}\n(Transport: put your whole answer, ${K.json ? 'the JSON object as a string' : 'the GLSL code'}, in the "code" field.)`;
  for (let attempt = 0; ; attempt++) {
    const gap = 2200 - (Date.now() - lastHosted);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    lastHosted = Date.now();
    const t0 = Date.now();
    const r = await fetch(HOSTED, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'content-type': 'application/json', origin: 'https://positron.studio' },
      body: JSON.stringify({ text: wish, lang: 'glsl', contract, previous, error, model }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429 && attempt < 5) { const w = Number(r.headers.get('retry-after') || 10); console.log(`  429, waiting ${w} s`); await new Promise((s) => setTimeout(s, w * 1000 + 500)); continue; }
    if (!r.ok) throw new Error(`hosted ${r.status}: ${j.error || ''}`);
    return { text: j.code || j.raw || '', ms: Date.now() - t0, serverMs: j.ms, tokensIn: j.usage?.prompt_tokens, tokensOut: j.usage?.completion_tokens, model: j.model };
  }
}

const ask = via === 'hosted' ? askHosted : askOllama;
const gpu = await openGpu();
const quit = () => { gpu.close(); process.exit(1); };
process.on('SIGINT', quit); process.on('SIGTERM', quit);

async function check(kind, text) {
  const K = KINDS[kind];
  if (K.json) {
    const p = parseJson(text);
    if (p.err) return { error: p.err };
    const e = K.validate(p.j);
    if (e.length) return { error: e.slice(0, 6).join('; '), errors: e };
    if (!K.compile) return { ok: true, value: p.j };
    // sdf-tree: the device compiles the tree to GLSL and the same grid check applies
    const r = await gpu.checkSdf(K.compile(p.j));
    return r.ok ? { ok: true, value: p.j, stats: r.stats } : { error: r.error.replace(/ \(check divisions, sqrt and pow of negatives\)/, ''), stats: r.stats };
  }
  if (K.check) return K.check(gpu, stripFences(text));
  const code = stripFences(text);
  const s = sdfStatic(code);
  if (s.length) return { error: s.join('; ') };
  const r = await gpu.checkSdf(code);
  return r.ok ? { ok: true, value: code, stats: r.stats } : { error: r.error, stats: r.stats };
}

try {
  for (const kind of kinds) {
    const list = WISHES[KINDS[kind].wishes || kind];
    const from = Number(arg('from', 0)), to = Number(arg('to', list.length));
    for (let i = from; i < to; i++) {
      if (done.has(`${kind}:${i}`)) continue;
      const wish = list[i];
      const tries = []; let previous = null, error = null, passed = 0, value = null, stats = null;
      const t0 = Date.now();
      for (let t = 1; t <= TRIES; t++) {
        let a;
        try { a = await ask(kind, wish, previous, error); }
        catch (e) { tries.push({ error: `no answer: ${e.message}`, ms: Date.now() - t0 }); error = 'no answer'; continue; }
        const c = await check(kind, a.text);
        tries.push({ ...a, text: a.text.slice(0, 6000), error: c.error || '', stats: c.stats });
        if (c.ok) { passed = t; value = c.value; stats = c.stats; break; }
        previous = a.text.slice(0, 6000) || '(empty answer)'; error = c.error;
      }
      const row = { model, via, schema: via === 'ollama' ? SCHEMA : 'code-wrapper', kind, i, wish, passed, ms: Date.now() - t0, tries, value, stats };
      appendFileSync(out, JSON.stringify(row) + '\n');
      console.log(`${kind} ${i} ${passed ? `PASS@${passed}` : 'FAIL'} ${(row.ms / 1000).toFixed(1)}s ${passed ? '' : tries.at(-1)?.error?.slice(0, 140)}`);
    }
  }
} finally { gpu.close(); }
