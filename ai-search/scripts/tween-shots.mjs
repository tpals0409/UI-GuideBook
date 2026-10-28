// 애니메이션 목록의 썸네일을 만들어요. 내 컴퓨터에서만 돌려요(크롬과 cwebp 필요): node scripts/tween-shots.mjs
// Tween UI의 미리보기 페이지(/preview/<이름>)를 크롬 헤드리스로 찍어 UI/tween/<이름>.webp로 저장해요. 이미 있는 건 건너뛰어요.
// 만든 파일은 커밋해요. 배포 때는 이 폴더를 그대로 올리고, 썸네일이 없는 항목은 글자 카드로 보여요.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(dir, '..', 'UI', 'tween');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const list = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'tween.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tween-'));
const todo = list.filter(e => !fs.existsSync(path.join(out, `${e.name}.webp`)));
for (let i = 0; i < todo.length; i += 4) {
  await Promise.all(todo.slice(i, i + 4).map(async e => {
    const png = path.join(tmp, `${e.name}.png`);
    try {
      await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', `--window-size=${e.kind === 'block' ? '1200,750' : '720,450'}`, // 작은 컴포넌트는 좁은 창에서 찍어 크게 보여요
        '--virtual-time-budget=7000', `--screenshot=${png}`, `https://tween-ui.vercel.app/preview/${e.name}`], { timeout: 60000 });
      await run('cwebp', ['-quiet', '-resize', '600', '0', '-q', '72', png, '-o', path.join(out, `${e.name}.webp`)]);
      console.log('찍었어요', e.name);
    } catch (err) { console.warn('못 찍었어요', e.name, err.message.split('\n')[0]); }
  }));
}
fs.rmSync(tmp, { recursive: true, force: true });
