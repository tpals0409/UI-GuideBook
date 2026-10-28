// 코드 갤러리(Tween UI 컴포넌트, data/tween.json)를 검색 문서로 만들어요. 코드 본문은 넣지 않고 이름·설명만 넣어요.
import fs from 'node:fs';

const GROUP = { button: '버튼', nav: '내비게이션', card: '카드', text: '글자', slider: '슬라이더', logo: '로고', testimonial: '후기', pricing: '요금제', cta: '행동 유도', footer: '푸터', loader: '로딩', etc: '그 밖' };

export default function extractTween({ source, file }) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).map(e => ({
    id: `${source}:${e.name}`,
    source,
    title: `${e.title}${e.ko ? ` (${e.ko})` : ''}`,
    url: `UI/ui-glossary.html#anim/${e.name}`,
    tags: [GROUP[e.group] || e.group],
    text: [
      `이름: ${e.title}`,
      e.ko && `한글 이름: ${e.ko}`,
      `종류: ${e.kind === 'block' ? '화면 블록' : '컴포넌트'} · ${GROUP[e.group] || e.group}`,
      e.desc && `설명: ${e.desc}`,
      `영어 설명: ${e.en}`,
      `필요한 것: React 19, Tailwind CSS v4${e.deps?.length ? ', ' + e.deps.join(', ') : ''}`,
      `설치: ${e.install}`,
    ].filter(Boolean).join('\n'),
  }));
}
