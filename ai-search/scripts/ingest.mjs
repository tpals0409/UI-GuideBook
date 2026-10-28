// 자료를 추출해 Worker에 올려요. 바뀐 문서만 다시 임베딩돼요.
//   AI_SEARCH_URL=https://... ADMIN_TOKEN=... node scripts/ingest.mjs
//   node scripts/ingest.mjs --dry-run   (업로드 없이 추출 결과만 확인)
//   node scripts/ingest.mjs --full      (임베딩 모델을 바꿨을 때: 전체 다시 색인)
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import glossary from '../extractors/glossary.mjs';
import markdown from '../extractors/markdown.mjs';
import tween from '../extractors/tween.mjs';
import motion from '../extractors/motion.mjs';
import buildEdges from './graph.mjs';

const EXTRACTORS = { glossary, markdown, tween, motion };
const CHUNK = 800, OVERLAP = 100, BATCH = 25;
const here = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.join(here, '..');
const root = path.join(configDir, '..'); // 개발 체크리스트 폴더 (url의 기준)
const args = new Set(process.argv.slice(2));

// 긴 글은 문단 경계를 우선해서 자르고, 앞뒤를 조금 겹쳐요
function chunk(text) {
  if (text.length <= CHUNK) return [text];
  const out = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + CHUNK, text.length);
    const para = text.lastIndexOf('\n', end);
    if (end < text.length && para > i + CHUNK / 2) end = para;
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = end - OVERLAP;
  }
  return out;
}

const docs = sources.flatMap(s => EXTRACTORS[s.extractor]({ ...s, file: path.join(configDir, s.path), root }));
const ids = new Set();
for (const d of docs) {
  if (ids.has(d.id)) throw new Error(`중복 id: ${d.id}`);
  ids.add(d.id);
  d.chunks = chunk(d.text).map((text, n) => ({ n, text }));
  d.hash = crypto.createHash('sha256').update(JSON.stringify([d.title, d.url, d.source, d.tags, d.text])).digest('hex');
}

const bySource = {};
for (const d of docs) bySource[d.source] = (bySource[d.source] || 0) + 1;
console.log(`추출: 문서 ${docs.length}개, 청크 ${docs.reduce((n, d) => n + d.chunks.length, 0)}개`, bySource);
// 관계(그래프): 문서 사이의 연결. 전체를 한 번에 올리고, 내용이 같으면 Worker가 건너뛰어요
const edges = buildEdges(docs, { termCodeJson: path.join(configDir, 'data', 'term-code.json'), tweenJson: path.join(configDir, 'data', 'tween.json') });
const edgesHash = crypto.createHash('sha256').update(JSON.stringify(edges)).digest('hex');
const byRel = {};
for (const e of edges) byRel[e.rel] = (byRel[e.rel] || 0) + 1;
console.log(`관계: ${edges.length}개`, byRel);
if (args.has('--dry-run')) process.exit(0);

const { AI_SEARCH_URL, ADMIN_TOKEN } = process.env;
if (!AI_SEARCH_URL || !ADMIN_TOKEN) throw new Error('AI_SEARCH_URL, ADMIN_TOKEN 환경 변수가 필요해요.');
const call = async (route, body) => {
  const res = await fetch(new URL(route, AI_SEARCH_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${route} ${res.status}: ${await res.text()}`);
  return res.json();
};

const plan = await call('/ingest/plan', { docs: docs.map(d => ({ id: d.id, hash: d.hash })), full: args.has('--full') });
const changed = docs.filter(d => plan.changed.includes(d.id));
for (let i = 0; i < changed.length; i += BATCH) {
  const batch = changed.slice(i, i + BATCH).map(({ text, ...d }) => d);
  await call('/ingest/upsert', { docs: batch });
  console.log(`업로드 ${Math.min(i + BATCH, changed.length)} / ${changed.length}`);
}
if (plan.deleted.length) await call('/ingest/delete', { ids: plan.deleted });
console.log('관계', await call('/ingest/edges', { hash: edgesHash, edges }));
// 글에서 관계 뽑기(Claude): 아직 안 읽었거나 내용이 바뀐 자료만. 실패하면 다음 배포 때 다시 시도돼요
const todo = await call('/ingest/extract-plan', {});
let aiEdges = 0;
for (let i = 0; i < todo.ids.length; i += todo.batch) {
  const r = await call('/ingest/extract', { ids: todo.ids.slice(i, i + todo.batch) });
  aiEdges += r.edges;
  console.log(`관계 추출 ${Math.min(i + todo.batch, todo.ids.length)} / ${todo.ids.length}`);
}
console.log({ 관계추출: todo.ids.length, 새관계: aiEdges });
console.log({ added: plan.added, updated: plan.updated, deleted: plan.deleted.length, unchanged: docs.length - changed.length });
