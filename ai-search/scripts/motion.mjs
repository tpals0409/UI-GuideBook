// 모션 목록을 만들어요. build-site.mjs가 배포할 때 public/motion.json으로 써요.
// 출처: prompt-motion.com (Claude로 만든 모션 영상 갤러리). 영상과 프롬프트의 권리는 각 작성자에게 있어요.
// 나만 보는 사이트(Cloudflare Access)에서 참고용으로만 써요. 영상은 복사하지 않고 원래 주소로 재생해요.
// 받은 목록은 data/motion.json에 저장해 두고, 다음부터는 새로 생긴 글만 받아요 (사이트에 부담을 줄이려고).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://prompt-motion.com';
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'motion.json');
const NOT_ENTRY = new Set(['templates', 'customize', 'blog', 'sponsor']);
const str = (s, re) => { const m = s.match(re); return m ? JSON.parse(m[1]) : undefined; }; // RSC 안의 JSON 문자열 값

// 글 하나: 페이지의 JSON-LD(영상 정보) + Next.js RSC 데이터(프롬프트, 태그, 스킬 설치 명령)
export function parseEntry(slug, html) {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1] || 'null');
  if (ld?.['@type'] !== 'VideoObject') return null;
  const rsc = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  // 긴 글은 "$27"처럼 따로 둔 줄을 가리켜요. 그 줄은 "27:T<바이트 길이(16진수)>,<본문>" 모양이에요
  const ref = v => {
    const m = typeof v === 'string' && v.match(/^\$([0-9a-z]+)$/);
    if (!m) return typeof v === 'string' && v.startsWith('$$') ? v.slice(1) : v; // "$$"로 시작하면 글자 그대로의 $
    const h = rsc.match(new RegExp(`(?:^|\\n)${m[1]}:T([0-9a-f]+),`));
    return h ? Buffer.from(rsc.slice(h.index + h[0].length)).subarray(0, parseInt(h[1], 16)).toString() : undefined;
  };
  const dd = k => str(rsc, new RegExp(`"children":"${k}"\\}\\],\\["\\$","dd",null,\\{"className":"[^"]*","children":("(?:[^"\\\\]|\\\\.)*")`));
  const e = {
    slug, title: ld.name, author: ld.creator?.name, handle: ld.creator?.url?.split('/').pop(),
    date: ld.uploadDate, video: ld.contentUrl, poster: [].concat(ld.thumbnailUrl)[0],
    tags: JSON.parse(rsc.match(/"tags":(\[[^\]]*\])/)?.[1] || '[]'),
    model: dd('Model'), effort: dd('Effort'),
    post: rsc.match(/https:\/\/x\.com\/[\w]+\/status\/\d+/)?.[0],
  };
  const prompt = ref(str(rsc, /"prompt":("(?:[^"\\]|\\.)*")/));
  if (prompt) e.prompt = prompt;
  const install = str(rsc, /\{"text":("(?:[^"\\]|\\.)*"),"label":"Copy install command"\}/);
  if (install) {
    e.install = install;
    e.skill = ref(str(rsc, /"children":"Skill"\}\],\["\$","p",null,\{"className":"[^"]*","children":("(?:[^"\\]|\\.)*")/));
  }
  return e.prompt || e.install ? e : null;
}

export async function buildMotionList() {
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const slugs = [...xml.matchAll(/<loc>https:\/\/prompt-motion\.com\/([^/<]+)<\/loc>/g)].map(m => m[1]).filter(s => !NOT_ENTRY.has(s));
  // 배포 서버(GitHub Actions)에서는 사이트가 봇 확인 화면을 줄 때가 있어요. 그때는 저장해 둔 목록을 그대로 써요
  if (!slugs.length) throw new Error('사이트맵에서 글을 찾지 못했어요');
  const have = new Map(old.map(e => [e.slug, e]));
  const todo = slugs.filter(s => !have.has(s));
  // ponytail: 한 번에 4개씩, 순서대로. 글이 수천 개로 늘면 그때 속도를 다시 봐요
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async s => {
      try {
        const e = parseEntry(s, await (await fetch(`${SITE}/${s}`)).text());
        if (e) have.set(s, e);
      } catch (err) { console.warn(`모션 예시를 읽지 못했어요: ${s} (${err.message})`); }
    }));
  }
  const list = slugs.map(s => have.get(s)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 1) + '\n');
  return list;
}
