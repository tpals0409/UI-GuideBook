// 사이트(ui.leo0409.work)에 올릴 파일을 public/에 모아요. npm run deploy가 먼저 실행해요.
// 올리는 파일은 sources.config.mjs와 같아요 (용어 사전 html + 모든 .md 문서).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import { walk } from '../extractors/markdown.mjs';
import { buildFontList } from './fonts.mjs';

const configDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(configDir, '..'); // 개발 체크리스트 폴더
const out = path.join(configDir, 'public');

const filesIn = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => path.join(dir, e.name));
const files = sources.flatMap(s => {
  const p = path.join(configDir, s.path);
  const assets = (s.assets ?? []).flatMap(a => filesIn(path.join(configDir, a)));
  return [...(s.extractor === 'markdown' ? walk(p, s.exclude ?? []) : [p]), ...assets];
});
fs.rmSync(out, { recursive: true, force: true });
const docs = [];
for (const f of files) {
  const rel = path.relative(root, f).split(path.sep).join('/').normalize('NFC');
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  if (f.endsWith('.md')) {
    const h1 = fs.readFileSync(f, 'utf8').split('\n').find(l => l.startsWith('# '));
    docs.push({ title: h1 ? h1.slice(2).trim() : path.basename(f, '.md'), url: rel });
  }
}
// 사이드바의 "문서" 목록. 폴더에 .md를 추가하면 다음 배포 때 자동으로 나타나요.
docs.sort((a, b) => a.url.localeCompare(b.url));
fs.writeFileSync(path.join(out, 'docs.json'), JSON.stringify(docs));
// 예시 테마의 글꼴 목록 (무료·오픈소스 글꼴)
const fonts = await buildFontList();
fs.writeFileSync(path.join(out, 'fonts.json'), JSON.stringify(fonts));
console.log(`public/에 ${files.length}개 파일, 문서 목록(${docs.length}개), 글꼴 목록(${fonts.length}개)을 만들었어요`);
