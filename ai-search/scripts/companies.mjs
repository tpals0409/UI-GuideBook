// 예시 테마의 "회사" 팔레트 목록을 만들어요. build-site.mjs가 배포할 때 public/companies.json으로 써요.
// 출처: oh-my-design (https://oh-my-design.kr, npm oh-my-design-cli, MIT). 실제 회사 화면과 공식 문서에서 다시 정리한 값이에요.
// 회사가 직접 낸 파일은 아니고, 디자인 권리는 각 회사에 있어요. 모든 회사를 쓰고, 검증 전(partial·legacy)인 회사는 표시해 둬요.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const norm = h => (h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h).toLowerCase();
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v * t + rgb(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); // a를 t만큼
const lum = h => { const c = rgb(h).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// DESIGN.md 맨 위 YAML의 colors: 블록만 읽어요 ('키: #값' 한 줄씩이라 YAML 파서 없이 충분해요)
function colorsOf(md) {
  const fm = md.split(/^---$/m)[1] || '';
  const block = fm.split(/^colors:\s*$/m)[1];
  if (!block) return null;
  const out = {};
  for (const l of block.split('\n').slice(1)) {
    if (/^\S/.test(l)) break;
    const m = l.match(/^ {2}([\w-]+):\s*['"]?(#[0-9a-fA-F]+)['"]?\s*$/);
    if (m && HEX.test(m[2])) out[m[1]] = norm(m[2]);
  }
  return { name: (fm.match(/^name:\s*['"]?(.+?)['"]?\s*$/m) || [])[1], c: out };
}

// 색 말고 모양: 모서리 둥글기(작게·중간·크게, 버튼)와 글꼴. 우리 글꼴 목록(무료)에 있는 글꼴만 써요
const block = (fm, key) => (fm.split(new RegExp(`^${key}:\\s*$`, 'm'))[1] || '').split(/\n(?=\S)/)[0];
const px = v => { const n = parseFloat(v); return /^\s*['"]?\d+(\.\d+)?px/.test(v) && n <= 40 ? n + 'px' : null; };
export function styleOf(md, fonts) {
  const fm = md.split(/^---$/m)[1] || '', r = {};
  for (const m of block(fm, 'rounded').matchAll(/^ {2}([\w-]+):\s*(.+)$/gm)) r[m[1]] = m[2];
  const radius = {
    sm: px(r.sm || r.xs || r.badge || r.chip || ''),
    md: px(r.md || r.control || r.input || r.button || ''),
    lg: px(r.lg || r.card || r.xl || ''),
  };
  // 버튼: 컴포넌트 중 첫 버튼의 rounded. 999px 이상이나 full이면 알약 모양
  const b = block(fm, 'components').match(/type: button\n(?: {4}.+\n)*? {4}rounded:\s*(.+)/);
  if (b) radius.btn = /full|pill|999/.test(b[1]) || parseFloat(b[1]) >= 100 ? '999px' : px(b[1]);
  for (const k in radius) if (!radius[k]) delete radius[k];
  // 글꼴: fonts.roles와 typography의 fontFamily를 순서대로 보고, 목록에 있는 첫 글꼴
  const fams = [...block(fm, 'fonts').matchAll(/^ {4}\w+:\s*(.+)$/gm), ...fm.matchAll(/fontFamily:\s*(.+)/g)]
    .flatMap(m => m[1].split(',')).map(x => x.replace(/['"]/g, '').replace(/ Variable$/, '').trim());
  const font = fams.map(f => fonts.find(x => x.family === f || x.name === f)).find(Boolean);
  return { ...(Object.keys(radius).length && { radius }), ...(font && { font: font.id }) };
}

// 회사마다 이름이 달라서, 흔한 이름부터 차례로 찾아 우리 역할 8개에 맞춰요. 없는 값은 있는 값으로 섞어 만들어요.
const pick = (c, ...ks) => ks.map(k => c[k]).find(Boolean);
// 이름으로 못 찾으면 가진 색에서 골라요: 강조색은 가장 채도 높은 색(상태 색 제외), 글자는 표면과 대비가 가장 큰 색
const sat = h => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const STATE = /success|warn|error|danger|info|positive|negative|caution|alert|red|green|yellow|orange/;
export function toPalette(id, name, c) {
  const all = Object.entries(c);
  const surface = pick(c, 'canvas', 'background', 'bg', 'page', 'paper', 'white', 'surface') || '#ffffff';
  const text = pick(c, 'foreground', 'ink', 'heading', 'text', 'text-primary', 'black', 'charcoal', 'body')
    || all.map(e => e[1]).sort((a, b) => ratio(b, surface) - ratio(a, surface))[0];
  if (!text || ratio(text, surface) < 3) return null; // 글자가 안 보이는 조합이면 예시가 의미 없어요
  const primary = pick(c, 'primary', 'brand', 'accent', 'action', 'cta', 'link')
    || all.filter(([k, v]) => !STATE.test(k) && sat(v) > 0.35).sort((a, b) => sat(b[1]) - sat(a[1]))[0]?.[1]
    || text; // 무채색 브랜드(검정 강조)
  const dark = lum(surface) < 0.4;
  // 회사가 적어 둔 값은 그대로 두고, 없을 때만 대비가 더 큰 쪽으로 골라요
  const onPrimary = pick(c, 'on-primary', 'on-brand', 'on-accent') || (ratio('#ffffff', primary) >= ratio('#111111', primary) ? '#ffffff' : '#111111');
  const s2 = pick(c, 'surface', 'surface-alt', 'subtle', 'canvas-soft', 'surface-2', 'elevated');
  return {
    id: 'co-' + id, name, src: `https://oh-my-design.kr/design-systems/${id}`,
    primary, onPrimary,
    primarySoft: pick(c, 'weak-background', 'primary-soft', 'primary-light', 'brand-soft') || mix(primary, surface, dark ? 0.24 : 0.14),
    surface,
    surface2: s2 && s2 !== surface ? s2 : mix(text, surface, dark ? 0.08 : 0.04),
    text,
    muted: pick(c, 'muted', 'text-secondary', 'text-muted', 'body', 'secondary', 'slate', 'subtle-text') || mix(text, surface, 0.6),
    border: pick(c, 'hairline', 'border', 'divider', 'outline', 'line') || mix(text, surface, dark ? 0.2 : 0.12),
    ...(dark && { dark: true }),
  };
}

// 한국어 이름: 사이트 한국어 목록 페이지의 구조화 데이터(JSON-LD)에서 id → 이름을 읽어요. 못 받으면 영문 이름을 써요
async function koNames() {
  const html = await (await fetch('https://oh-my-design.kr/ko/design-systems')).text();
  return new Map([...html.matchAll(/"name":"([^"]+)","url":"https:\/\/oh-my-design\.kr\/ko\/design-systems\/([^"]+)"/g)].map(m => [m[2], m[1]]));
}

export async function buildCompanyList(fonts = []) {
  const ko = await koNames().catch(() => new Map());
  const meta = await (await fetch('https://registry.npmjs.org/oh-my-design-cli/latest')).json();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omd-'));
  try {
    const tgz = path.join(dir, 'p.tgz');
    fs.writeFileSync(tgz, Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer()));
    execFileSync('tar', ['xzf', tgz, '-C', dir, 'package/data/reference-quality.json', 'package/web/references']);
    const pkg = path.join(dir, 'package');
    const items = JSON.parse(fs.readFileSync(path.join(pkg, 'data/reference-quality.json'), 'utf8')).items;
    const ok = items.map(i => i.id), status = Object.fromEntries(items.map(i => [i.id, i.status]));
    const list = [];
    for (const id of ok) {
      const f = path.join(pkg, 'web/references', id, 'DESIGN.md');
      if (!fs.existsSync(f)) continue;
      const md = fs.readFileSync(f, 'utf8'), r = colorsOf(md);
      const p = r && { ...toPalette(id, r.name || id, r.c), ...styleOf(md, fonts), ...(status[id] !== 'verified_v2' && { unverified: true }) };
      if (!p?.primary) continue;
      // "Classum (클라썸)"처럼 괄호 안에 한글 이름이 있으면 한글만 보여줘요
      const k = ko.get(id) || p.name, m = k.match(/^(.+?) \(([^)]*[가-힣][^)]*)\)$/);
      const name = m ? m[2] : k;
      list.push(name !== p.name ? { ...p, name, en: p.name } : p);
    }
    // 한글 이름 → 영문 이름 → 그 밖(일본어·중국어) 순서로 보여줘요
    const grp = n => (/[가-힣]/.test(n) ? 0 : /^[\x00-\x7f]+$/.test(n) ? 1 : 2);
    return list.sort((a, b) => grp(a.name) - grp(b.name) || a.name.localeCompare(b.name, 'ko'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
