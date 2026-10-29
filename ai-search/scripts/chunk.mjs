// 긴 글을 검색용 조각으로 나눠요. 문단 경계를 우선해서 자르고, 앞뒤를 OVERLAP만큼 겹쳐요.
// Worker(src/mcp.ts의 joinChunks)가 이 겹침을 빼고 다시 이어 붙이니, 두 쪽을 같이 바꿔야 해요 (test/unit.test.mjs가 왕복을 확인해요).
export const CHUNK = 800, OVERLAP = 100;

export function chunk(text) {
  if (text.length <= CHUNK) return [text];
  const out = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + CHUNK, text.length);
    const para = text.lastIndexOf('\n', end);
    if (end < text.length && para > i + CHUNK / 2) end = para;
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = end - OVERLAP;
  }
  return out;
}
