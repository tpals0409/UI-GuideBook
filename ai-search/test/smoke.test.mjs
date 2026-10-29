// Worker 전체를 가짜 바인딩으로 한 번 돌려요: ingest → 검색(캐시 포함) → 그래프 → MCP → 주소별 라우팅.
// 라우팅이나 D1 쿼리가 깨지면 배포 전에 여기서 걸려요.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, ADMIN_TOKEN } from './harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let h;
before(async () => {
  h = await start();
  // 비동기로: 같은 프로세스가 Worker 서버라서 동기 실행은 서로 기다리다 멈춰요
  await promisify(execFile)('node', [path.join(ROOT, 'scripts', 'ingest.mjs')], { env: { ...process.env, AI_SEARCH_URL: h.adminUrl, ADMIN_TOKEN } });
}, { timeout: 120_000 });
after(() => h.close());

const post = (base, p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };

test('ingest: 문서·벡터·관계가 들어가요', async () => {
  const s = await (await fetch(h.adminUrl + '/stats', { headers: admin })).json();
  const docs = s.sources.reduce((n, x) => n + x.docs, 0);
  assert.ok(docs > 400, `docs ${docs}`);
  assert.equal(h.vectors.size > docs, true, '조각이 문서보다 많아요');
  assert.ok(s.edges.find(e => e.origin === 'data')?.n > 100);
  assert.ok(s.edges.find(e => e.origin === 'ai')?.n > 100);
});

test('검색: 답과 실제 자료를 돌려주고, 같은 질문은 Claude를 다시 부르지 않아요', async () => {
  const before = h.claudeCalls.length;
  const r = await post(h.url, '/search', { q: '탭이 미끄러지는 코드' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.answer, '테스트 답변');
  assert.ok(j.results.length >= 1 && j.results.every(x => x.id !== 'not-real'), '없는 id는 걸러요');
  assert.equal(h.claudeCalls.length, before + 1);
  const r2 = await post(h.url, '/search', { q: '탭이  미끄러지는 코드?' }); // 공백·문장 부호만 달라요
  assert.deepEqual(await r2.json(), j);
  assert.equal(h.claudeCalls.length, before + 1, '캐시 적중');
  assert.equal((await post(h.url, '/search', { q: '' })).status, 400);
});

test('그래프·MCP는 사이트 주소에서만', async () => {
  const g = await (await fetch(h.url + '/graph')).json();
  assert.ok(g.edges.length > 200 && Object.keys(g.nodes).length > 100);
  const m = await post(h.url, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { accept: 'application/json, text/event-stream' });
  assert.equal(m.status, 200);
  assert.match(await m.text(), /"name":"company"/);
  assert.equal((await fetch(h.adminUrl + '/graph')).status, 404);
});

test('다른 주소: 관리용 경로와 관리자 /search만 열려요', async () => {
  assert.equal((await post(h.adminUrl, '/search', { q: '탭' })).status, 404);
  const r = await post(h.adminUrl, '/search', { q: '탭', model: 'claude-sonnet-5-5' }, admin);
  assert.equal(r.status, 200);
  assert.ok((await r.json()).usage, '모델을 명시하면 usage가 붙어요');
  assert.equal((await fetch(h.adminUrl + '/stats')).status, 401);
});

test('MCP company: 분야 키워드로 찾고 글꼴·타이포·대비·CSS 변수를 같이 줘요', async () => {
  const call = async q => {
    const r = await post(h.url, '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'company', arguments: { q } } }, { accept: 'application/json, text/event-stream' });
    const body = await r.text(); // SSE면 "data: {...}" 줄에 답이 있어요
    return JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? body).result.content[0].text;
  };
  assert.match(await call('fintech'), /7곳이 맞아요[\s\S]*- 토스 \(Toss\) \[Fintech\] 강조색 #3182f6/); // 여럿이면 한 줄씩 요약
  const t = await call('banking'); // 토스의 느낌 키워드
  assert.match(t, /# 토스 \(Toss\)/);
  assert.match(t, /분야: Fintech/);
  assert.match(t, /글꼴: Pretendard .*<link rel="stylesheet"/);
  assert.match(t, /타이포.*h1 36px\/700\/54px/);
  assert.match(t, /본문\/표면 \d+\.\d\d:1 AA 통과/);
  assert.match(t, /--danger: #e42939;[\s\S]*--sp-md: 8px;[\s\S]*--font-sans: "Pretendard"/);
  assert.match(await call('없는회사zz'), /맞는 회사가 없어요/);
});
