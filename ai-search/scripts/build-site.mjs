// 사이트(ui.leo0409.work)에 올릴 파일을 public/에 모아요. npm run deploy가 먼저 실행해요.
// 올리는 파일은 sources.config.mjs와 같아요 (용어 사전 html + 모든 .md 문서).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sources from '../sources.config.mjs';
import { walk } from '../extractors/markdown.mjs';

const configDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(configDir, '..'); // 개발 체크리스트 폴더
const out = path.join(configDir, 'public');

const files = sources.flatMap(s => {
  const p = path.join(configDir, s.path);
  return s.extractor === 'markdown' ? [...walk(p, s.exclude ?? [])] : [p];
});
fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, path.relative(root, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
console.log(`public/에 ${files.length}개 파일을 복사했어요`);
