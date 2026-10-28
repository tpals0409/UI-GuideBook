// 애니메이션 코드 모음을 만들어요. build-site.mjs가 배포할 때 public/tween.json으로 써요.
// 출처: Tween UI (https://tween-ui.vercel.app, github.com/StaticMania/tween-ui, MIT). React 19 + Tailwind v4 + GSAP 컴포넌트예요.
// shadcn 레지스트리(/r/*.json)에서 설명과 전체 소스를 받아요. 한국어 이름·설명은 tween.ko.json에 적어 두고, 없으면 영어로 보여줘요.
// 받은 목록은 data/tween.json에 저장해 두고, 받아오지 못하면 그것을 써요.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://tween-ui.vercel.app';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(dir, 'data', 'tween.json');
const KO = JSON.parse(fs.readFileSync(path.join(dir, 'tween.ko.json'), 'utf8'));

// 이름으로 종류를 나눠요 (목록에서 거를 때 써요). 위에서부터 처음 맞는 것
const GROUPS = [
  ['button', /button/], ['nav', /navbar|tabs/], ['loader', /loader/], ['footer', /footer/], ['cta', /cta/], ['pricing', /pricing/],
  ['text', /text|wordmark|kinetic|counter|svg-draw/], ['logo', /logo/], ['testimonial', /testimonial|rating|strip/],
  ['slider', /carousel|slider|wipe|fan|rotating/], ['card', /card|grid|gallery|cascade|expand|scatter|reveal|drift|item|process|hub/],
];
const groupOf = name => GROUPS.find(([, re]) => re.test(name))?.[0] || 'etc';

const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); };

export async function buildTweenList() {
  const index = await json(`${SITE}/r/registry.json`);
  const items = index.items.filter(i => i.type === 'registry:ui' || i.type === 'registry:block');
  if (!items.length) throw new Error('레지스트리가 비어 있어요');
  const list = [];
  for (let i = 0; i < items.length; i += 6) {
    list.push(...await Promise.all(items.slice(i, i + 6).map(async it => {
      const [r, demo] = await Promise.all([json(`${SITE}/r/${it.name}.json`), json(`${SITE}/r/${it.name}-demo.json`).catch(() => null)]);
      const kind = it.type.endsWith('block') ? 'block' : 'component';
      return {
        name: it.name, kind, group: groupOf(it.name), title: it.title, ko: KO[it.name]?.[0], desc: KO[it.name]?.[1], en: it.description,
        deps: r.dependencies || [], install: `npx shadcn@latest add @tween-ui/${it.name}`, page: `${SITE}/${kind}/${it.name}`,
        files: (r.files || []).map(f => ({ path: f.path, content: f.content })),
        // 미리보기를 우리 사이트에서 직접 만들 때 쓰는 사용 예시 (scripts/tween-previews.mjs)
        demo: demo?.files?.[0]?.content, needs: (r.registryDependencies || []).map(u => u.split('/').pop().replace('.json', '')),
      };
    })));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list) + '\n');
  return list;
}

export const savedTweenList = () => JSON.parse(fs.readFileSync(file, 'utf8'));
