// 폴더 안의 .md 문서를 "## 제목" 단위로 나눠요. 제목 하나 = 검색 결과 하나.
import fs from 'node:fs';
import path from 'node:path';

// GitHub 방식의 제목 앵커 (한글은 그대로 둬요)
const slug = s => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

export function* walk(dir, exclude) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || exclude.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, exclude);
    else if (e.name.endsWith('.md')) yield p;
  }
}

export default function extractMarkdown({ source, file: dir, root, exclude = [] }) {
  const docs = [];
  for (const file of walk(dir, exclude)) {
    // macOS는 한글 파일 이름을 NFD로, Git·Linux는 NFC로 다뤄요. 어디서 돌려도 같은 id가 나오게 NFC로 맞춰요.
    const rel = path.relative(root, file).split(path.sep).join('/').normalize('NFC');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const h1 = (lines.find(l => l.startsWith('# ')) || `# ${path.basename(file, '.md')}`).slice(2).trim();
    let cur = { heading: '', body: [] };
    const sections = [cur];
    for (const l of lines) {
      if (l.startsWith('## ')) sections.push(cur = { heading: l.slice(3).trim(), body: [] });
      else if (!l.startsWith('# ')) cur.body.push(l);
    }
    for (const s of sections) {
      const text = s.body.join('\n').trim();
      if (!text) continue;
      const anchor = s.heading ? slug(s.heading) : '';
      docs.push({
        id: `${source}:${rel}#${anchor}`,
        source,
        title: s.heading ? `${h1} › ${s.heading}` : h1,
        url: anchor ? `${rel}#${anchor}` : rel,
        tags: [rel.split('/')[0]],
        text,
      });
    }
  }
  return docs;
}
