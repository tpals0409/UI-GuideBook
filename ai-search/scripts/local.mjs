// 서버(MCP) 없이 이 저장소의 파일만으로 자료를 찾아요. 의존성·네트워크·비용 0.
//   node scripts/local.mjs search "아래에서 올라오는 창" [--source ui-glossary|tween|motion|docs] [--n 8]
//   node scripts/local.mjs graph ui-glossary:dialog [--hops 2]
//   node scripts/local.mjs get tween:sliding-tabs [--code]
//   node scripts/local.mjs list tween [걸러볼 말]
//   node scripts/local.mjs company [이름 또는 영문 키워드]
//   node scripts/local.mjs stats
// 문서와 기본 관계는 ingest.mjs와 같은 추출기·graph.mjs를 그대로 써요. 여기서 더하는 것:
//   검색  — 임베딩 대신 낱말 점수(BM25). 한글은 두 글자씩 잘라 조사·붙여쓰기를 견뎌요. 상위 결과의 이웃을 조금 끌어올려요.
//   관계  — 코드·영상·문서의 글에 용어 이름이 나오면 mentions로 이어요 (graph.mjs는 용어끼리만 봐요).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import glossary from '../extractors/glossary.mjs';
import markdown from '../extractors/markdown.mjs';
import tween from '../extractors/tween.mjs';
import motion from '../extractors/motion.mjs';
import buildEdges from './graph.mjs';

const EXTRACTORS = { glossary, markdown, tween, motion };
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..'), root = path.join(dir, '..');
const data = f => JSON.parse(fs.readFileSync(path.join(dir, 'data', f), 'utf8'));
const REL_KO = { code: '코드', uses: '사용', compare: '비교', mentions: '언급' };

// ── 문서 ────────────────────────────────────────────────────────────────
function loadDocs() {
  const docs = sources.flatMap(s => EXTRACTORS[s.extractor]({ ...s, file: path.join(dir, s.path), root }));
  // 영상은 프롬프트 전문이 fullPrompt에 있어요. 추출기가 넣지 않은 경우에만 검색 글에 붙여요.
  const full = new Map(data('motion.json').map(e => [`motion:${e.slug}`, e.fullPrompt]));
  for (const d of docs) if (d.source === 'motion' && full.get(d.id) && !d.text.includes('프롬프트:')) d.text += `\n프롬프트:\n${full.get(d.id)}`;
  return docs;
}

// ── 관계 ────────────────────────────────────────────────────────────────
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMMON = /^(Card|List|Table|Button|Menu|Grid|Blur|Hero|Modal|Toast|Panel|Tabs|Text|Icon|Link|Image|Form|Label|Chart|Color|Code|Step|Page|Line|Field|Input|Scroll|Header|Footer|Section|Layout|Slider|슬라이더|카드|목록|버튼|메뉴|표|배지|패널|모달|창|탭|바|아이콘|링크|입력|색|단계|글자)$/i;
function loadEdges(docs) {
  const edges = buildEdges(docs, { termCodeJson: path.join(dir, 'data', 'term-code.json'), tweenJson: path.join(dir, 'data', 'tween.json') });
  const key = new Set(edges.map(e => `${e.src}|${e.dst}`));
  const terms = docs.filter(d => d.source === 'ui-glossary').map(d => {
    const en = d.text.match(/^영문 이름: (.+)$/m)?.[1]?.trim(), ko = d.text.match(/^한글 이름: (.+)$/m)?.[1]?.trim();
    const names = [en, ko].filter(n => n && (/[가-힣]/.test(n) ? n.length >= 3 : n.length >= 5) && !COMMON.test(n));
    return names.length && { id: d.id, re: new RegExp(`(^|[^A-Za-z가-힣])(${names.map(esc).join('|')})(?![A-Za-z])`, 'i') };
  }).filter(Boolean);
  for (const d of docs) {
    if (d.source === 'ui-glossary') continue;
    // 영상 프롬프트는 길고 낱말이 흔해서 제목·종류·스킬 설명까지만 봐요
    // 코드의 "종류" 줄은 묶음 이름(슬라이더, 카드 …)이라 용어와 뜻이 달라서 빼요
    const body = d.source === 'motion' ? d.text.split('\n프롬프트:')[0] : d.text.replace(/^(종류|설치|필요한 것): .+$/gm, '');
    for (const t of terms) if (t.re.test(body) && !key.has(`${d.id}|${t.id}`) && !key.has(`${t.id}|${d.id}`)) { key.add(`${d.id}|${t.id}`); edges.push({ src: d.id, rel: 'mentions', dst: t.id, weight: 0.5 }); }
  }
  return edges;
}
const around = (edges, ids) => { const s = new Set(ids); return edges.filter(e => s.has(e.src) || s.has(e.dst)); };

// ── 검색 ────────────────────────────────────────────────────────────────
// 영문·숫자는 낱말로, 한글은 낱말 + 두 글자 조각으로 (조각만 맞으면 낱말보다 약하게)
function tokens(s) {
  const out = [];
  for (const w of s.toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) ?? []) {
    if (/[a-z0-9]/.test(w)) { if (w.length > 1) out.push(w); continue; }
    out.push(w);
    for (let i = 0; i + 2 <= w.length; i++) if (w.length > 2) out.push('~' + w.slice(i, i + 2));
  }
  return out;
}
function search(docs, edges, q, { source, n = 8 } = {}) {
  const pool = source ? docs.filter(d => d.source === source) : docs;
  const K1 = 1.4, B = 0.6;
  const fields = pool.map(d => {
    const tf = new Map(); let len = 0;
    for (const [text, w] of [[d.title, 3], [(d.tags || []).join(' '), 2], [d.text, 1]]) for (const t of tokens(text)) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
    return { d, tf, len };
  });
  const avg = fields.reduce((s, f) => s + f.len, 0) / (fields.length || 1);
  const df = new Map();
  for (const f of fields) for (const t of f.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const qt = [...new Set(tokens(q))];
  const score = new Map();
  for (const f of fields) {
    let s = 0;
    for (const t of qt) {
      const tf = f.tf.get(t); if (!tf) continue;
      const idf = Math.log(1 + (fields.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += (t[0] === '~' ? 0.5 : 1) * idf * tf * (K1 + 1) / (tf + K1 * (1 - B + B * f.len / avg));
    }
    if (s > 0) score.set(f.d.id, s);
  }
  // 상위 5개의 이웃을 조금 끌어올려요 (점수가 있던 문서만 — 관계만으로 새로 끼워 넣지는 않아요)
  const top = [...score].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [id, s] of top) for (const e of around(edges, [id])) { const o = e.src === id ? e.dst : e.src; if (score.has(o)) score.set(o, score.get(o) + 0.15 * s * e.weight); }
  const byId = new Map(docs.map(d => [d.id, d]));
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, s]) => ({ doc: byId.get(id), score: s }));
}
// 질문 낱말이 가장 많이 나오는 줄
function snippet(d, q) {
  const qt = tokens(q).filter(t => t[0] !== '~');
  let best = '', bs = -1;
  for (const line of d.text.split('\n')) { const l = line.toLowerCase(); const s = qt.filter(t => l.includes(t)).length; if (s > bs && line.trim()) { bs = s; best = line.trim(); } }
  return best.length > 160 ? best.slice(0, 160) + '…' : best;
}

// ── 회사 (src/mcp.ts의 company와 같은 출력) ──────────────────────────────
const slug = s => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function companyText(c, fonts) {
  // 글꼴 주소는 fonts.extra.json에 있는 것만 알아요 (Google Fonts 목록은 배포 때 네트워크로 받아요)
  const f = fonts.find(x => slug(x.name) === c.font || slug(x.family) === c.font);
  const stack = f ? `"${f.family}", system-ui, sans-serif` : 'system-ui, sans-serif';
  const roles = ['primary', 'onPrimary', 'primarySoft', 'surface', 'surface2', 'text', 'muted', 'border', 'danger', 'success', 'warning'].filter(k => c[k]);
  const contrast = [['본문/표면', 'text', 'surface'], ['보조 글자/표면', 'muted', 'surface'], ['강조색 위 글자/강조색', 'onPrimary', 'primary'], ['강조색/연한 강조색', 'primary', 'primarySoft']]
    .map(([name, a, b]) => { const v = ratio(c[a], c[b]); return `${name} ${v.toFixed(2)}:1 ${v >= 4.5 ? 'AA 통과' : v >= 3 ? '큰 글자만' : '미달'}`; }).join(' · ');
  return [
    `# ${c.name}${c.en ? ` (${c.en})` : ''}${c.dark ? ' · 어두운 테마' : ''}${c.unverified ? ' · 미검증' : ''}`,
    `출처: ${c.src} (oh-my-design이 정리한 공개 값, 회사 공식 파일 아님)`,
    c.category && `분야: ${c.category}${c.tags?.length ? ` · 느낌: ${c.tags.join(', ')}` : ''}`,
    f ? `글꼴: ${f.name} (${f.license || '-'}) <link rel="stylesheet" href="${f.css}">` : c.font && `글꼴: ${c.font} (주소는 fonts.extra.json에 없어요)`,
    c.type && `타이포(크기/굵기/행간): ${Object.entries(c.type).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `대비: ${contrast}`,
    `:root{\n${[...roles.map(k => `  --${k}: ${c[k]};`), ...Object.entries(c.radius || {}).map(([k, v]) => `  --r-${k}: ${v};`), ...Object.entries(c.spacing || {}).map(([k, v]) => `  --sp-${k}: ${v}px;`), `  --font-sans: ${stack};`].join('\n')}\n}`,
  ].filter(Boolean).join('\n');
}
function company(q) {
  const all = data('companies.json'), fonts = JSON.parse(fs.readFileSync(path.join(dir, 'fonts.extra.json'), 'utf8'));
  if (!q) return all.map(c => c.name + (c.en && c.en !== c.name ? ` (${c.en})` : '') + (c.category ? ` [${c.category}]` : '')).join(', ');
  const k = q.toLowerCase();
  let hit = all.filter(c => [c.name, c.en, c.id].some(s => s?.toLowerCase().includes(k)));
  if (!hit.length) hit = all.filter(c => [c.category, ...(c.tags ?? [])].some(s => s?.toLowerCase().includes(k)));
  if (!hit.length) return `'${q}'에 맞는 회사가 없어요.`;
  if (hit.length > 20) return `${hit.length}곳이 맞아요. 더 좁혀요: ` + hit.map(c => c.name).join(', ');
  if (hit.length > 5) return `${hit.length}곳이 맞아요. 하나를 골라 이름으로 다시 불러요:\n` + hit.map(c => `- ${c.name}${c.en ? ` (${c.en})` : ''}${c.category ? ` [${c.category}]` : ''} 강조색 ${c.primary}${c.tags?.length ? ` · ${c.tags.slice(0, 4).join(', ')}` : ''}`).join('\n');
  return hit.map(c => companyText(c, fonts)).join('\n\n');
}

// ── 명령 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2), cmd = argv[0];
const opt = name => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
const flags = new Set(['--source', '--n', '--hops']);
const rest = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !flags.has(arr[i - 1])).join(' ');
const line = e => `${e.src} -${REL_KO[e.rel] ?? e.rel}-> ${e.dst}`;

if (cmd === 'company') console.log(company(rest));
else if (['search', 'graph', 'get', 'list', 'stats'].includes(cmd)) {
  const docs = loadDocs(), edges = loadEdges(docs), byId = new Map(docs.map(d => [d.id, d]));
  if (cmd === 'stats') {
    const count = (xs, k) => xs.reduce((o, x) => (o[x[k]] = (o[x[k]] || 0) + 1, o), {});
    console.log(`문서 ${docs.length}개`, count(docs, 'source'), `\n관계 ${edges.length}개`, count(edges, 'rel'));
  } else if (cmd === 'search') {
    const hits = search(docs, edges, rest, { source: opt('source'), n: Number(opt('n') || 8) });
    if (!hits.length) console.log('맞는 자료가 없어요.');
    for (const { doc, score } of hits) {
      const rel = around(edges, [doc.id]).slice(0, 4).map(e => `${REL_KO[e.rel]}:${e.src === doc.id ? e.dst : e.src}`).join(', ');
      console.log(`${score.toFixed(1).padStart(5)}  ${doc.id}  —  ${doc.title}\n       ${snippet(doc, rest)}${rel ? `\n       관계 ${rel}` : ''}`);
    }
  } else if (cmd === 'graph') {
    let frontier = [rest]; const seen = new Set(frontier), out = [];
    for (let h = 0; h < Math.min(Number(opt('hops') || 1), 2) && frontier.length; h++) {
      const es = around(edges, frontier); frontier = [];
      for (const e of es) { out.push(`${line(e)}   (${byId.get(e.src)?.title} → ${byId.get(e.dst)?.title})`); for (const n of [e.src, e.dst]) if (!seen.has(n)) { seen.add(n); frontier.push(n); } }
    }
    console.log(byId.has(rest) ? [...new Set(out)].join('\n') || '관계가 없어요.' : `'${rest}'라는 id가 없어요. search나 list로 id를 먼저 찾아요.`);
  } else if (cmd === 'get') {
    const d = byId.get(rest);
    if (!d) console.log(`'${rest}'라는 id가 없어요.`);
    else {
      console.log(`# ${d.title}\nid: ${d.id}\n위치: ${d.url}\n\n${d.text}`);
      const es = around(edges, [d.id]); if (es.length) console.log(`\n관계:\n${es.map(line).join('\n')}`);
      if (d.source === 'tween') {
        const e = data('tween.json').find(x => `tween:${x.name}` === d.id);
        console.log(`\n사용 예:\n${e.demo}`);
        if (argv.includes('--code')) for (const f of e.files) console.log(`\n── ${f.path}\n${f.content}`);
        else console.log(`\n소스 ${e.files.length}개 파일은 --code를 붙이면 나와요.`);
      }
    }
  } else if (cmd === 'list') {
    const [source, ...q] = rest.split(' '), k = q.join(' ').toLowerCase();
    const rows = docs.filter(d => d.source === source && d.title.toLowerCase().includes(k));
    console.log(rows.length ? rows.map(d => `${d.id}  —  ${d.title}`).join('\n') : `출처는 ${[...new Set(docs.map(d => d.source))].join(', ')} 중 하나예요.`);
  }
} else console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 7).map(l => l.slice(3)).join('\n'));
