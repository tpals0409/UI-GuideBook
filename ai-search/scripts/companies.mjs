// 예시 테마의 "회사" 팔레트 목록을 만들어요. build-site.mjs가 배포할 때 public/companies.json으로 써요.
// 출처: oh-my-design (https://oh-my-design.kr, npm oh-my-design-cli, MIT). 실제 회사 화면과 공식 문서에서 다시 정리한 값이에요.
// 회사가 직접 낸 파일은 아니고, 디자인 권리는 각 회사에 있어요. 검증을 마친(verified_v2) 회사만 써요.
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

// 회사마다 이름이 달라서, 흔한 이름부터 차례로 찾아 우리 역할 8개에 맞춰요. 없는 값은 있는 값으로 섞어 만들어요.
const pick = (c, ...ks) => ks.map(k => c[k]).find(Boolean);
export function toPalette(id, name, c) {
  const primary = pick(c, 'primary', 'brand', 'accent', 'action');
  const surface = pick(c, 'canvas', 'background', 'white');
  const text = pick(c, 'foreground', 'ink', 'heading', 'text', 'black');
  if (!primary || !surface || !text) return null;
  if (lum(surface) < 0.5) return null; // ponytail: 어두운 배경 회사는 빼요. 예시들이 밝은 표면 기준이라서. 다크 예시가 생기면 넣어요
  // 회사가 적어 둔 값은 그대로 두고, 없을 때만 대비가 더 큰 쪽으로 골라요
  const onPrimary = pick(c, 'on-primary', 'on-brand', 'on-accent') || (ratio('#ffffff', primary) >= ratio(text, primary) ? '#ffffff' : text);
  const s2 = pick(c, 'surface', 'surface-alt', 'subtle', 'canvas-soft');
  return {
    id: 'co-' + id, name, src: `https://oh-my-design.kr/design-systems/${id}`,
    primary, onPrimary,
    primarySoft: pick(c, 'weak-background', 'primary-soft', 'primary-light', 'brand-soft') || mix(primary, surface, 0.14),
    surface,
    surface2: s2 && s2 !== surface ? s2 : mix(text, surface, 0.04),
    text,
    muted: pick(c, 'muted', 'text-secondary', 'text-muted', 'body', 'secondary', 'slate') || mix(text, surface, 0.6),
    border: pick(c, 'hairline', 'border', 'divider', 'outline') || mix(text, surface, 0.12),
  };
}

export async function buildCompanyList() {
  const meta = await (await fetch('https://registry.npmjs.org/oh-my-design-cli/latest')).json();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omd-'));
  try {
    const tgz = path.join(dir, 'p.tgz');
    fs.writeFileSync(tgz, Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer()));
    execFileSync('tar', ['xzf', tgz, '-C', dir, 'package/data/reference-quality.json', 'package/web/references']);
    const pkg = path.join(dir, 'package');
    const ok = JSON.parse(fs.readFileSync(path.join(pkg, 'data/reference-quality.json'), 'utf8')).items.filter(i => i.status === 'verified_v2').map(i => i.id);
    const list = [];
    for (const id of ok) {
      const f = path.join(pkg, 'web/references', id, 'DESIGN.md');
      if (!fs.existsSync(f)) continue;
      const r = colorsOf(fs.readFileSync(f, 'utf8'));
      const p = r && toPalette(id, r.name || id, r.c);
      if (p) list.push(p);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
