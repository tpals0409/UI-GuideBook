// 영상 갤러리(prompt-motion, data/motion.json)를 검색 문서로 만들어요. 프롬프트 전문이 들어가요 (긴 건 조각으로 나뉘어요).
import fs from 'node:fs';

const TAG = { 'product-ui': '화면 UI', phone: '휴대폰', charts: '차트', diagrams: '다이어그램', 'kinetic-type': '키네틱 타이포', shapes: '도형', particles: '파티클', characters: '캐릭터', photos: '사진', music: '음악', code: '코드' };

export default function extractMotion({ source, file }) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).map(e => ({
    id: `${source}:${e.slug}`,
    source,
    title: e.title,
    url: `UI/ui-glossary.html#motion/${e.slug}`,
    tags: (e.tags || []).map(t => TAG[t] || t),
    text: [
      `제목: ${e.title}`,
      `작성자: ${e.author || ''} (@${e.handle || ''})`,
      `종류: ${(e.tags || []).map(t => TAG[t] || t).join(', ')}`,
      e.model && `모델: ${e.model}${e.effort ? ` · 노력 수준 ${e.effort}` : ''}`,
      e.prompt && `프롬프트:\n${e.prompt}`,
      e.skill && `스킬 설명: ${e.skill}`,
      e.install && `설치: ${e.install}`,
    ].filter(Boolean).join('\n'),
  }));
}
