// Worker를 가짜 바인딩(AI, Vectorize, D1, Rate limit)과 가짜 Claude로 Node에서 돌려요. 네트워크·비용 0.
//   테스트에서: import { start } from './harness.mjs' → { url, env, claudeCalls, close }
//   손으로 볼 때: node test/harness.mjs  (Worker :8812, 상태 :8813. ingest는 AI_SEARCH_URL=http://localhost:8812 ADMIN_TOKEN=secret-token npm run ingest)
// 사이트 주소는 localhost, 다른 주소(관리용 workers.dev 역할)는 127.0.0.1로 흉내 내요.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADMIN_TOKEN = 'secret-token';
// Workers 런타임에만 있는 함수
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(a, b);

const listen = (server, port = 0) => new Promise(r => server.listen(port, () => r(server.address().port)));
const msg = (model, obj) => JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(obj) }] });

// 가짜 Claude: 요청을 기록하고, 스키마 enum의 앞 항목으로 답을 만들어요 (검색·팔레트·관계 추출 세 가지 스키마)
function fakeClaude(calls) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const body = JSON.parse(b); calls.push({ headers: req.headers, body });
      const props = body.output_config.format.schema.properties;
      res.setHeader('content-type', 'application/json');
      if (props.primary) return res.end(msg(body.model, { name: '레몬 소다', primary: '#ffd400', onPrimary: '#ffffff', primarySoft: '#fff7cc', surface: '#ffffff', surface2: '#fafafa', text: '#aaaaaa', muted: '#cccccc', border: '#eeeeee' }));
      if (props.relations) { const src = props.relations.items.properties.src.enum, dst = props.relations.items.properties.dst.enum; return res.end(msg(body.model, { relations: src.map(s => ({ src: s, rel: 'compare', dst: dst.find(d => d !== s), why: 't' })) })); }
      const ids = props.results.items.properties.id.enum;
      res.end(msg(body.model, { answer: '테스트 답변', results: [{ id: ids[0], reason: 'r1' }, { id: 'not-real', reason: 'x' }] }));
    });
  });
}

// 단어 해시로 만든 가짜 임베딩 (같은 단어가 많을수록 가까워요)
const words = s => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const vec = s => { const v = new Array(64).fill(0); for (const w of words(s)) { let h = 0; for (const ch of w) h = (h * 31 + ch.codePointAt(0)) % 64; v[h]++; } const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export async function start({ sitePort } = {}) {
  const claudeCalls = [];
  const claude = fakeClaude(claudeCalls);
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${await listen(claude)}`;

  const store = new Map();
  const AI = { async run(_m, input) {
    if (input.text) return { shape: [input.text.length, 64], data: input.text.map(vec) };
    return { response: input.contexts.map((c, id) => ({ id, score: cos(vec(input.query), vec(c.text)) })) };
  } };
  const VECTORIZE = {
    async upsert(vs) { vs.forEach(v => store.set(v.id, v)); return {}; },
    async deleteByIds(ids) { ids.forEach(i => store.delete(i)); return {}; },
    async query(v, o) {
      const all = [...store.values()].filter(x => !o.filter?.source || x.metadata.source === o.filter.source);
      return { matches: all.map(x => ({ id: x.id, score: cos(v, x.values) })).sort((a, b) => b.score - a.score).slice(0, o.topK), count: 0 };
    },
  };
  const db = new DatabaseSync(':memory:');
  for (const m of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) db.exec(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
  });
  const DB = { prepare: sql => stmt(sql), batch: async ss => { for (const s of ss) await s.run(); return []; } };
  let hits = 0;
  const RATE_LIMITER = { limit: async () => ({ success: ++hits <= 10 }) };
  const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' };
  const ASSETS = { fetch: async r => {
    const p = decodeURIComponent(new URL(r.url).pathname);
    try { return new Response(fs.readFileSync(path.join(ROOT, 'public', p)), { headers: { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' } }); } catch { return new Response('nf', { status: 404 }); }
  } };

  const worker = (await import(path.join(ROOT, 'src', 'index.ts'))).default;
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', async () => {
      const r = await worker.fetch(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : b }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
    });
  });
  const port = await listen(server, sitePort);
  const env = { AI, VECTORIZE, DB, RATE_LIMITER, ASSETS, SITE_HOST: 'localhost' /* hostname 비교라 포트는 빼요 */, ALLOWED_ORIGINS: `http://localhost:${port}`, ANTHROPIC_API_KEY: 'test', ADMIN_TOKEN };
  return {
    url: `http://localhost:${port}`, // 사이트 주소 (페이지·검색·MCP)
    adminUrl: `http://127.0.0.1:${port}`, // 다른 주소 (관리용 경로만 열려요)
    env, db, claudeCalls, vectors: store,
    close: () => { server.close(); claude.close(); },
  };
}

// 직접 실행하면 고정 포트로 떠 있어요
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = await start({ sitePort: 8812 });
  http.createServer((_q, res) => res.end(JSON.stringify({ vectors: h.vectors.size, docs: h.db.prepare('SELECT COUNT(*) n FROM docs').get(), claudeCalls: h.claudeCalls.length }))).listen(8813);
  console.log(`worker on ${h.url} (admin: ${h.adminUrl}, 상태: http://localhost:8813)`);
}
