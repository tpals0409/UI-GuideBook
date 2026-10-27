// UI 용어 사전 html에서 용어 데이터를 꺼내요.
// html의 데이터 스크립트(add(...), HOW)를 그대로 실행하므로 용어를 html에서만 관리하면 돼요.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const strip = (s = '') => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .trim();

export default function extractGlossary({ source, file, root }) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .filter(code => !code.includes("$('#app').innerHTML")); // 화면을 그리는 스크립트는 제외

  // 브라우저 전역을 흉내 내는 최소한의 가짜 객체
  const noop = () => {};
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false }),
    addEventListener: noop, removeEventListener: noop, requestAnimationFrame: noop,
    localStorage: { getItem: () => null, setItem: noop },
    location: { hash: '' }, navigator: {},
    document: { documentElement: { dataset: {}, classList: { add: noop, remove: noop } }, querySelector: () => null, querySelectorAll: () => [] },
  });
  for (const code of scripts) vm.runInContext(code, ctx);
  const { TERMS, HOW, CATS } = vm.runInContext('({ TERMS, HOW, CATS })', ctx);

  const rel = path.relative(root, file).split(path.sep).join('/');
  return TERMS.map(t => ({
    id: `${source}:${t.id}`,
    source,
    title: `${strip(t.en)} (${strip(t.ko)})`,
    url: `${rel}#${t.id}`,
    tags: [CATS[t.cat]],
    text: [
      `영문 이름: ${strip(t.en)}`,
      `한글 이름: ${strip(t.ko)}`,
      t.aka && `별칭: ${strip(t.aka)}`,
      `분류: ${CATS[t.cat]}`,
      `설명: ${strip(t.desc)}`,
      t.diff && `차이: ${strip(t.diff)}`,
      HOW[t.id] && `동작 방식:\n${HOW[t.id].map(s => `- ${strip(s)}`).join('\n')}`,
    ].filter(Boolean).join('\n'),
  }));
}
