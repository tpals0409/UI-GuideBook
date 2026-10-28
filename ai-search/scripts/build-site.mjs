// 사이트(ui.leo0409.work)에 올릴 파일을 public/에 모아요. npm run deploy가 먼저 실행해요.
// 올리는 파일은 sources.config.mjs와 같아요 (용어 사전 html + 모든 .md 문서).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import { walk } from '../extractors/markdown.mjs';
import { buildFontList } from './fonts.mjs';
import { buildCompanyList } from './companies.mjs';
import { buildMotionList } from './motion.mjs';
import { build as bundle } from 'rolldown';
import { buildTweenList, savedTweenList } from './tween.mjs';
import { buildTweenPreviews } from './tween-previews.mjs';

const configDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(configDir, '..'); // 개발 체크리스트 폴더
const out = path.join(configDir, 'public');

const filesIn = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => path.join(dir, e.name));
const files = sources.filter(s => s.site !== false).flatMap(s => { // site:false는 검색에만 넣는 자료
  const p = path.join(configDir, s.path);
  const assets = (s.assets ?? []).map(a => path.join(configDir, a)).flatMap(a => (fs.statSync(a).isDirectory() ? filesIn(a) : [a]));
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
// 예시 테마의 회사 팔레트 (oh-my-design). 받아오지 못해도 배포는 계속해요
const companies = await buildCompanyList(fonts).catch(err => { console.warn(`회사 팔레트를 받지 못했어요: ${err.message}`); return []; });
fs.writeFileSync(path.join(out, 'companies.json'), JSON.stringify(companies));
// 모션 예시 (prompt-motion). 받아오지 못하면 저장해 둔 목록을 써요
const motion = await buildMotionList().catch(err => { console.warn(`모션 예시를 새로 받지 못했어요: ${err.message}`); return JSON.parse(fs.readFileSync(path.join(configDir, 'data', 'motion.json'), 'utf8')); });
fs.writeFileSync(path.join(out, 'motion.json'), JSON.stringify(motion));
// 애니메이션 코드 모음 (Tween UI). 받아오지 못하면 저장해 둔 목록을 써요
const tween = await buildTweenList().catch(err => { console.warn(`애니메이션 코드를 새로 받지 못했어요: ${err.message}`); return savedTweenList(); });
// 목록에는 이름·설명만, 코드는 항목마다 따로 (상세를 열 때만 받아요)
fs.writeFileSync(path.join(out, 'tween.json'), JSON.stringify(tween.map(({ demo, needs, files, ...e }) => e)));
fs.mkdirSync(path.join(out, 'UI', 'tween-code'), { recursive: true });
for (const e of tween) fs.writeFileSync(path.join(out, 'UI', 'tween-code', `${e.name}.json`), JSON.stringify(e.files));
// 미리보기는 우리 사이트에서 직접 묶어요 (예시 테마를 넣을 수 있게)
await buildTweenPreviews(tween, path.join(out, 'UI', 'tween-preview'));
// 움직이는 아이콘: 쓰는 아이콘만 묶은 작은 스크립트
await bundle({ input: path.join(configDir, 'scripts', 'icons-entry.mjs'), output: { file: path.join(out, 'UI', 'icons.js'), format: 'iife', minify: true }, logLevel: 'warn' });
console.log(`public/에 ${files.length}개 파일, 문서 목록(${docs.length}개), 글꼴 목록(${fonts.length}개), 회사 팔레트(${companies.length}개), 모션 예시(${motion.length}개), 애니메이션 코드(${tween.length}개)를 만들었어요`);
