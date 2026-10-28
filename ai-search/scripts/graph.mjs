// 자료 사이의 관계(그래프)를 만들어요. ingest.mjs가 문서를 뽑은 뒤 이 결과를 Worker의 edges 표에 올려요.
// 지금은 데이터에 이미 적혀 있는 관계만 써요 (비용 0). 글에서 Claude로 뽑는 관계는 2단계에서 더해요.
//   code     용어 → 코드 컴포넌트 (data/term-code.json: Tabs → Sliding Tabs)
//   uses     코드 컴포넌트 → 다른 컴포넌트 (레지스트리 의존)
//   compare  용어의 "차이" 문단에서 이름이 나온 다른 용어 (Dialog ↔ Modal)
//   mentions 용어의 설명·동작 방식에서 이름이 나온 다른 용어
import fs from 'node:fs';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default function buildEdges(docs, { termCodeJson, tweenJson }) {
  const edges = new Map(); // "src|rel|dst" → edge (중복 방지)
  const add = (src, rel, dst, weight = 1) => { if (src !== dst) edges.set(`${src}|${rel}|${dst}`, { src, rel, dst, weight }); };
  const has = new Set(docs.map(d => d.id));

  // 용어 → 코드: 손으로 적어 둔 표
  for (const [term, names] of Object.entries(JSON.parse(fs.readFileSync(termCodeJson, 'utf8')))) for (const n of names) if (has.has(`tween:${n}`) && has.has(`ui-glossary:${term}`)) add(`ui-glossary:${term}`, 'code', `tween:${n}`);

  // 코드 → 코드: 다른 컴포넌트를 가져다 쓰는 관계
  for (const e of JSON.parse(fs.readFileSync(tweenJson, 'utf8'))) for (const n of e.needs || []) if (has.has(`tween:${n}`)) add(`tween:${e.name}`, 'uses', `tween:${n}`);

  // 용어 ↔ 용어: 다른 용어의 이름(영문 전체 이름 또는 한글 이름)이 글에 나오면 연결해요
  const terms = docs.filter(d => d.source === 'ui-glossary').map(d => {
    const en = d.text.match(/^영문 이름: (.+)$/m)?.[1]?.trim(), ko = d.text.match(/^한글 이름: (.+)$/m)?.[1]?.trim();
    const aka = (d.text.match(/^별칭: (.+)$/m)?.[1] || '').split('·').map(a => a.replace(/\(.*?\)/g, '').trim());
    const diff = d.text.match(/^차이: (.+)$/m)?.[1] || '';
    const rest = d.text.replace(/^차이: .+$/m, '').replace(/^(영문 이름|한글 이름|별칭|분류): .+$/gm, '');
    // 이름이 너무 짧거나 흔한 말(예: "Card", "리스트")은 다른 설명에 자주 나와서 빼요. 한글 이름은 조사가 붙으니(툴팁은) 앞 경계만 봐요
    const names = [en, ko, ...aka].filter(n => n && (/[가-힣]/.test(n) ? n.length >= 2 : n.length >= 4) && !/^(Card|List|Table|Button|Menu|Grid|Blur|Hero|Modal|Toast|Panel|카드|목록|버튼|메뉴|표|배지|패널|모달|창|탭|바)$/i.test(n));
    return { id: d.id, names, diff, rest };
  });
  for (const t of terms) for (const o of terms) {
    if (t === o || !o.names.length) continue;
    const re = new RegExp(`(^|[^A-Za-z가-힣])(${o.names.map(esc).join('|')})(?![A-Za-z])`, 'i');
    if (re.test(t.diff)) add(t.id, 'compare', o.id, 1);
    else if (re.test(t.rest)) add(t.id, 'mentions', o.id, 0.5);
  }
  return [...edges.values()];
}
