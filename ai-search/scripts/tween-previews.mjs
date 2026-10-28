// 애니메이션(Tween UI) 미리보기를 우리 사이트에서 직접 만들어요 → public/UI/tween-preview/
// 같은 주소에서 열리니 용어 사전이 예시 테마(색·글꼴)를 미리보기 안에 넣을 수 있어요.
// 1) data/tween.json의 컴포넌트와 사용 예시를 임시 폴더(.tween-build)에 풀어요
// 2) Tween UI의 고정 색(청록·라임·잉크 등)을 CSS 변수(--tp-*)로 바꿔요. 변수의 기본값은 우리 기본 테마(코발트)예요
// 3) React + Tailwind v4로 한 번에 묶어요. preview.html?n=<이름> 으로 하나씩 열려요 (움직이는 미리보기)
// 4) 같은 컴포넌트를 빌드 때 미리 HTML로 그려 둬요(SSR) → still/<이름>.html. 목록 타일은 JS 없이 이걸 보여줘서 빨라요
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(dir, '.tween-build');

// Tween UI 색 → 우리 테마 역할. 어두운 배경색(#03110f 등)은 그대로 둬요
const COLORS = {
  '045f64': 'var(--tp-brand)',      // 청록: 주 색 → 강조색(primary)
  'c6f56f': 'var(--tp-accent)',     // 라임: 포인트 → 연한 강조색(primary-soft)
  '12161f': 'var(--tp-ink)',        // 잉크: 글자 → 본문 글자(text)
  '9fd4d6': 'var(--tp-brand-text)', // 청록 위의 옅은 글자 → 강조색 위 글자를 강조색에 섞은 색
  'e8f3f2': 'var(--tp-tint)',       // 옅은 민트 배경 → 보조 표면(surface-2)
  '0b3b3e': 'var(--tp-brand-deep)', // 진한 청록 → 강조색을 어둡게
};
const theme = code => code
  .replace(/#(045f64|c6f56f|12161f|9fd4d6|e8f3f2|0b3b3e)\b/gi, (_, h) => COLORS[h.toLowerCase()])
  // 사용 예시의 사진·로고 파일은 원래 사이트에도 없어요. 로고는 Tween UI 미리보기처럼 아이콘 서비스로, 사진은 자리 표시 사진으로 바꿔요
  .replace(/(["'`])\/logos\/([a-z0-9]+?)(?:-dark)?\.svg/g, '$1https://api.iconify.design/simple-icons/$2.svg')
  .replace(/(["'`])\/(?:photos|avatars|services|images)\/([\w-]+)\.(?:jpe?g|png|webp)/g, '$1https://picsum.photos/seed/$2/960/640');

// 스크롤해야 움직이는 예시 (타일 안에는 스크롤할 공간이 없어서 자동 스크롤로 보여줘요)
const SCROLLY = ['wordmark-reveal', 'column-drift', 'testimonial-reel-focus', 'process-sticky-steps', 'footer-wordmark-rise', 'footer-pulse-links',
  'gyro-gallery', 'testimonial-ring', 'kinetic-type-ring', 'navbar-pill-glide', 'navbar-push-menu', 'navbar-gooey-bloom', 'navbar-corner-panel'];

export async function buildTweenPreviews(list, outDir) {
  fs.rmSync(src, { recursive: true, force: true });
  for (const e of list) {
    for (const f of e.files) {
      const p = path.join(src, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      // 미리보기 전용: 마우스를 올리면 무조건 멈추는 코드를 빼요 (보여 주는 코드는 원본 그대로)
      const src2 = f.content.replace(/onMouseEnter=\{(?:pause|\(\) => (?:pauseRef\.current\(\)|swiperRef\.current\?\.autoplay\?\.pause\(\)))\}/g, 'onMouseEnter={undefined}');
      fs.writeFileSync(p, theme(src2));
    }
    if (e.demo) {
      fs.mkdirSync(path.join(src, 'examples'), { recursive: true });
      // 몇몇 예시는 레이아웃 파일(<html><body>…)이라 그대로 그리면 아무것도 안 보여요. 겉 태그만 빼요
      let demo = e.demo.replace(/<html[^>]*>|<body[^>]*>/g, '<>').replace(/<\/html>|<\/body>/g, '</>');
      // '마우스를 올리면 멈춤'이 기본인 컴포넌트는 미리보기에서 그 기능을 꺼요 (보려고 마우스를 올리면 멈춰 버려서)
      const tag = demo.match(new RegExp(`import (\\w+) from '@/components/tweenui/${e.name}'`))?.[1];
      if (tag && e.files.some(f => /pauseOnHover\??:/.test(f.content)) && !/pauseOnHover/.test(demo))
        demo = demo.replace(new RegExp(`<${tag}(?=[\\s>/])`, 'g'), `<${tag} pauseOnHover={false}`);
      fs.writeFileSync(path.join(src, 'examples', `${e.name}-demo.tsx`), theme(demo));
    }
  }
  fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(src, 'lib', 'utils.ts'),
    `import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }\n`);
  fs.writeFileSync(path.join(src, 'style.css'), `@import "tailwindcss";
@source "./components";
@source "./examples";
/* 우리 사이트는 밝은 화면만 써요: dark: 변형은 .dark가 있을 때만 */
@custom-variant dark (&:where(.dark, .dark *));
:root{
  --tp-brand:var(--primary,#2e4fd8);--tp-accent:var(--primary-soft,#e2e8fc);--tp-ink:var(--text,#192132);
  --tp-brand-text:color-mix(in srgb,var(--on-primary,#fff) 72%,var(--tp-brand));--tp-tint:var(--surface-2,#f2f4f7);
  --tp-brand-deep:color-mix(in srgb,var(--tp-brand) 70%,#000);
}
html,body{margin:0;min-height:100%}
*{scrollbar-width:none}
*::-webkit-scrollbar{display:none}
body{font-family:var(--demo-font,"Gmarket Sans",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif);background:transparent;color:var(--tp-ink)} /* 용어 사전의 무대(점 격자)가 비쳐 보여요 */
#root{min-height:100vh;display:flex;align-items:center;justify-content:center}
#root>div{width:100%;display:flex;justify-content:center;align-items:center} /* w-full 컴포넌트가 0 폭이 되지 않게 */
#root>.block{display:block;align-self:stretch}
/* 스크롤로 움직이는 예시: 위아래에 여백을 두고 자동으로 스크롤해요 */
.scrolly #root{display:block;min-height:0;padding:50vh 0 50vh}
`);
  fs.writeFileSync(path.join(src, 'preview.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>미리보기</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/fonts-archive/GmarketSans/GmarketSans.css"></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>`);
  const blocks = list.filter(e => e.kind === 'block').map(e => e.name);
  fs.writeFileSync(path.join(src, 'main.tsx'), `import './style.css';
import { createRoot } from 'react-dom/client';
// 사용 예시 파일마다 따로 쪼개 불러와요 (하나 열 때 그 코드만 받아요)
const demos = import.meta.glob('./examples/*-demo.tsx');
const BLOCKS = new Set(${JSON.stringify(blocks)});
// 페이지 스크롤에 맞춰 움직이는 것들 (ScrollTrigger·스크롤 위치를 씀)
const SCROLLY = new Set(${JSON.stringify(SCROLLY)});
const n = new URLSearchParams(location.search).get('n') || '';
const load = demos['./examples/' + n + '-demo.tsx'];
const root = createRoot(document.getElementById('root')!);
if (!load) root.render(<p>미리보기가 없어요: {n}</p>);
else load().then((m: any) => { const Demo = m.default; root.render(<div className={BLOCKS.has(n) ? 'block' : ''}><Demo /></div>); });
// 움직이는 미리보기에서는 스크롤 예시를 위→아래로 천천히 자동 스크롤하고 반복해요. 직접 휠·터치로 스크롤하면 멈춰요
if (SCROLLY.has(n) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('scrolly');
  let y = 0, on = true;
  const stop = () => { on = false; };
  addEventListener('wheel', stop, { passive: true }); addEventListener('touchstart', stop, { passive: true });
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const step = () => {
    if (!on) return;
    y += Math.max(2, max() / 420);
    if (y >= max()) { scrollTo(0, max()); setTimeout(() => { y = 0; scrollTo(0, 0); requestAnimationFrame(step); }, 1500); return; }
    scrollTo(0, y); requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 700);
}
`);
  fs.writeFileSync(path.join(src, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', baseUrl: '.', paths: { '@/*': ['./*'] } } }));
  await build({
    root: src, base: './', logLevel: 'warn', configFile: false,
    plugins: [react(), tailwind()],
    resolve: { alias: { '@/components/tweenui': path.join(src, 'components', 'tweenui'), '@/lib': path.join(src, 'lib'), '@': src } },
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(src, 'preview.html') }, chunkSizeWarningLimit: 2000 },
  });

  // SSR: 모든 사용 예시를 서버에서 HTML로 그려 정지 화면을 만들어요 (애니메이션은 브라우저에서만 돌아서 처음 모습 그대로예요)
  fs.writeFileSync(path.join(src, 'ssr.tsx'), `import { renderToString } from 'react-dom/server';
const demos = import.meta.glob('./examples/*-demo.tsx', { eager: true }) as Record<string, any>;
export function render(n: string, block: boolean) {
  const D = demos['./examples/' + n + '-demo.tsx']?.default;
  return D ? renderToString(<div className={block ? 'block' : ''}><D /></div>) : '';
}
`);
  const ssrOut = path.join(src, 'ssr-out');
  await build({
    root: src, logLevel: 'warn', configFile: false, plugins: [react()],
    resolve: { alias: { '@/components/tweenui': path.join(src, 'components', 'tweenui'), '@/lib': path.join(src, 'lib'), '@': src } },
    ssr: { noExternal: true }, build: { ssr: path.join(src, 'ssr.tsx'), outDir: ssrOut, emptyOutDir: true },
  });
  const { render } = await import(path.join(ssrOut, 'ssr.js'));
  const css = fs.readFileSync(path.join(outDir, 'preview.html'), 'utf8').match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
  fs.mkdirSync(path.join(outDir, 'still'), { recursive: true });
  for (const e of list) {
    let body = '';
    try { body = render(e.name, e.kind === 'block'); } catch (err) { console.warn('미리 그리지 못했어요', e.name, err.message); }
    fs.writeFileSync(path.join(outDir, 'still', `${e.name}.html`), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="../${css}"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/fonts-archive/GmarketSans/GmarketSans.css"></head><body><div id="root">${body}</div></body></html>`);
  }
}
