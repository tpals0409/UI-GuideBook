// 네트워크 없이 돌아가는 순수 함수만 확인해요: 추출기, 관계 그래프, 조각 나누기 ↔ 이어 붙이기 왕복.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import glossary from '../extractors/glossary.mjs';
import markdown from '../extractors/markdown.mjs';
import tween from '../extractors/tween.mjs';
import motion from '../extractors/motion.mjs';
import buildEdges from '../scripts/graph.mjs';
import { chunk, CHUNK, OVERLAP } from '../scripts/chunk.mjs';
import { joinChunks } from '../src/mcp.ts';

const configDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(configDir, '..');
const EXTRACTORS = { glossary, markdown, tween, motion };
const docs = sources.flatMap(s => EXTRACTORS[s.extractor]({ ...s, file: path.join(configDir, s.path), root }));
const by = source => docs.filter(d => d.source === source);
const readJson = f => JSON.parse(fs.readFileSync(path.join(configDir, f), 'utf8'));

test('추출기: 모든 자료에 id·제목·주소·본문이 있고 id가 겹치지 않아요', () => {
  assert.equal(new Set(docs.map(d => d.id)).size, docs.length);
  for (const d of docs) {
    assert.match(d.id, new RegExp(`^${d.source}:.+`), d.id);
    for (const k of ['title', 'url', 'text']) assert.ok(typeof d[k] === 'string' && d[k].trim(), `${d.id}.${k}`);
    assert.ok(Array.isArray(d.tags), `${d.id}.tags`);
  }
});

test('추출기: 출처별 개수가 데이터와 맞아요', () => {
  assert.ok(by('ui-glossary').length >= 120, `용어 ${by('ui-glossary').length}개`);
  assert.equal(by('tween').length, readJson('data/tween.json').length);
  assert.equal(by('motion').length, readJson('data/motion.json').length);
  assert.ok(by('docs').length >= 1);
  const tabs = by('ui-glossary').find(d => d.id === 'ui-glossary:tabs');
  assert.match(tabs.text, /^영문 이름: Tabs$/m);
  assert.match(tabs.text, /^한글 이름: /m);
});

test('그래프: 표에 적힌 용어→코드, 글에서 찾은 비교·언급이 나오고 자기 자신·없는 자료로는 안 이어요', () => {
  const edges = buildEdges(docs, { termCodeJson: path.join(configDir, 'data/term-code.json'), tweenJson: path.join(configDir, 'data/tween.json') });
  const ids = new Set(docs.map(d => d.id));
  const has = (src, rel, dst) => edges.some(e => e.src === src && e.rel === rel && e.dst === dst);
  assert.ok(has('ui-glossary:tabs', 'code', 'tween:sliding-tabs'));
  assert.ok(edges.some(e => e.rel === 'compare'), '비교 관계');
  assert.ok(edges.some(e => e.rel === 'mentions'), '언급 관계');
  for (const e of edges) {
    assert.notEqual(e.src, e.dst, `${e.src} 자기 자신`);
    assert.ok(ids.has(e.src) && ids.has(e.dst), `${e.src} → ${e.dst}`);
    assert.ok(e.weight > 0 && e.weight <= 1);
  }
  assert.equal(new Set(edges.map(e => `${e.src}|${e.rel}|${e.dst}`)).size, edges.length, '중복');
});

test('조각: 짧은 글은 1개, 긴 글은 한도 안에서 앞뒤가 겹쳐요', () => {
  assert.deepEqual(chunk('짧은 글'), ['짧은 글']);
  const long = Array.from({ length: 40 }, (_, i) => `문단 ${i} ${'가'.repeat(60)}`).join('\n');
  const parts = chunk(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= CHUNK, `조각 ${p.length}자`);
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i - 1].includes(parts[i].slice(0, OVERLAP / 2)), `조각 ${i} 겹침`);
});

test('왕복: 실제 자료 전부를 나눴다가 이어 붙이면 원문과 같아요 (Worker의 get이 이걸로 전문을 돌려줘요)', () => {
  const trimmed = s => s.trim();
  let long = 0;
  for (const d of docs) {
    const parts = chunk(d.text);
    if (parts.length > 1) long++;
    assert.equal(joinChunks(parts), trimmed(d.text), d.id);
  }
  assert.ok(long > 20, `긴 자료 ${long}개`); // 조각이 2개 이상인 자료가 실제로 검사됐는지
});
