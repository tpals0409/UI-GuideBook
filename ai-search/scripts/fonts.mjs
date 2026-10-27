// 예시 테마에서 고를 무료 글꼴 목록을 만들어요. build-site.mjs가 배포할 때 public/fonts.json으로 써요.
// - Google Fonts: 공개 메타데이터에서 한글을 지원하는 글꼴만 (모두 오픈소스 라이선스)
// - 그 밖의 유명 오픈소스 한글 글꼴: fonts.extra.json에 적은 목록 (CSS 주소가 살아 있는 것만)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const slug = s => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');

async function googleKorean() {
  const res = await fetch('https://fonts.google.com/metadata/fonts');
  if (!res.ok) throw new Error(`Google Fonts 목록 ${res.status}`);
  const text = await res.text();
  const { familyMetadataList } = JSON.parse(text.slice(text.indexOf('{')));
  return familyMetadataList
    .filter(f => (f.subsets || []).includes('korean'))
    .sort((a, b) => a.popularity - b.popularity) // 숫자가 작을수록 인기
    .map(f => {
      const weights = Object.keys(f.fonts || {}).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
      const pick = [...new Set([weights.includes(400) ? 400 : weights[0], weights.includes(700) ? 700 : weights.at(-1)])].filter(Boolean);
      const fam = f.family.replace(/ /g, '+');
      return {
        name: f.displayName || f.family, family: f.family, category: f.category, license: '오픈소스 (Google Fonts)',
        css: `https://fonts.googleapis.com/css2?family=${pick.length > 1 ? `${fam}:wght@${pick.join(';')}` : fam}&display=swap`,
      };
    });
}

async function extras() {
  const list = JSON.parse(fs.readFileSync(path.join(here, '..', 'fonts.extra.json'), 'utf8'));
  const ok = await Promise.all(list.map(f => fetch(f.css, { method: 'HEAD' }).then(r => r.ok, () => false)));
  ok.forEach((v, i) => { if (!v) console.warn(`글꼴 CSS를 찾지 못해 뺐어요: ${list[i].name}`); });
  return list.filter((_, i) => ok[i]);
}

export async function buildFontList() {
  const [extra, google] = await Promise.all([
    extras(),
    googleKorean().catch(err => { console.warn(`${err.message} — Google Fonts 없이 진행해요`); return []; }),
  ]);
  const seen = new Set();
  return [...extra, ...google]
    .filter(f => !seen.has(f.family) && seen.add(f.family))
    .map(f => ({ id: slug(f.family), ...f }));
}
