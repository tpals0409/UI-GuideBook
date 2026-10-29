// 검색 모델 비교 실험: 같은 질문을 두 Claude 모델로 돌려 답·고른 자료·토큰·시간을 나란히 적어요.
//   AI_SEARCH_URL=https://dev-reference-ai-search.tpals0409dev.workers.dev ADMIN_TOKEN=... node scripts/compare-models.mjs > compare.md
// ADMIN_TOKEN이 있어야 캐시를 거치지 않고 모델을 바꿀 수 있어요. 질문 10개 × 모델 2개 = Claude 20회.
const { AI_SEARCH_URL, ADMIN_TOKEN } = process.env;
if (!AI_SEARCH_URL || !ADMIN_TOKEN) throw new Error('AI_SEARCH_URL, ADMIN_TOKEN 환경 변수가 필요해요.');
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const QUESTIONS = [
  '툴팁이랑 팝오버 차이가 뭐야',
  '다이얼로그와 모달은 같은 건가요',
  '탭이 부드럽게 움직이는 코드 있어?',
  '스켈레톤 로딩은 언제 써야 해',
  '버튼 호버에 빛나는 효과 넣고 싶어',
  '로그인에서 비밀번호 틀렸을 때 뭐라고 안내해야 해',
  '글자가 타이핑되듯 나타나는 모션 프롬프트',
  '아코디언이랑 디스클로저 차이',
  '토스트는 몇 초 뒤에 사라져야 해',
  '카드 목록이 스크롤에 맞춰 나타나는 애니메이션',
];
const ask = async (q, model) => {
  const t = Date.now();
  const r = await fetch(new URL('/search', AI_SEARCH_URL), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` }, body: JSON.stringify({ q, model }) });
  const j = await r.json();
  return { ...j, ms: Date.now() - t, status: r.status };
};
const sum = Object.fromEntries(MODELS.map(m => [m, { input: 0, output: 0, ms: 0 }]));
console.log(`# 검색 모델 비교 (${new Date().toISOString().slice(0, 10)})\n`);
for (const q of QUESTIONS) {
  console.log(`## ${q}\n`);
  const rs = await Promise.all(MODELS.map(m => ask(q, m)));
  rs.forEach((r, i) => {
    const m = MODELS[i];
    if (r.status !== 200) { console.log(`**${m}**: 오류 ${r.status} ${r.error ?? ''}\n`); return; }
    const u = r.usage ?? {};
    sum[m].input += u.input ?? 0; sum[m].output += u.output ?? 0; sum[m].ms += r.ms;
    console.log(`**${m}** (${(r.ms / 1000).toFixed(1)}초, 입력 ${u.input ?? '?'} · 출력 ${u.output ?? '?'} 토큰)\n\n${r.answer}\n`);
    console.log(r.results.map(x => `- ${x.title} — ${x.reason}`).join('\n') || '- (고른 자료 없음)', '\n');
  });
  const [a, b] = rs.map(r => new Set((r.results ?? []).map(x => x.id)));
  const same = [...a].filter(x => b.has(x)).length;
  console.log(`같은 자료 ${same}개 / Opus ${a.size}개 · Sonnet ${b.size}개\n`);
}
console.log('## 합계\n\n| 모델 | 입력 토큰 | 출력 토큰 | 총 시간 |\n|---|---|---|---|');
for (const m of MODELS) console.log(`| ${m} | ${sum[m].input} | ${sum[m].output} | ${(sum[m].ms / 1000).toFixed(1)}초 |`);
