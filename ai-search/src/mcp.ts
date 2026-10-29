// 다른 프로젝트의 Claude Code가 이 자료(용어·회사 디자인·코드·영상 프롬프트·관계)를 쓰게 하는 MCP 서버예요.
// 주소: https://ui.leo0409.work/mcp (Cloudflare Access 서비스 토큰으로 잠겨요). 자료는 D1과 ASSETS에 이미 있는 것을 그대로 읽어요.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { REL_KO, edgesAround, search } from "./index.ts";

const SOURCES = ["ui-glossary", "tween", "motion", "docs"] as const;
const SOURCE_KO: Record<string, string> = { "ui-glossary": "용어", tween: "코드", motion: "영상", docs: "문서" };
type Doc = { id: string; title: string; url: string; source: string; text?: string };
type Company = Record<string, any> & { id: string; name: string; en?: string };

const text = (s: unknown) => ({ content: [{ type: "text" as const, text: typeof s === "string" ? s : JSON.stringify(s, null, 1) }] });
const fail = (s: string) => ({ ...text(s), isError: true });
const asset = async (env: Env, base: string, path: string) => {
  const r = await env.ASSETS.fetch(new Request(new URL(path, base).href));
  return r.ok ? r.json<any>() : null;
};

// 본문은 조각(앞뒤 100자 겹침)으로 저장돼 있어요. 겹치는 부분을 빼고 이어 붙여요
export const joinChunks = ([first = "", ...rest]: string[]) => rest.reduce((acc, p) => {
  for (let k = Math.min(140, acc.length, p.length); k > 0; k--) if (acc.endsWith(p.slice(0, k))) return acc + p.slice(k);
  return acc + "\n" + p;
}, first);

// 회사 팔레트를 바로 붙여 넣을 CSS 변수로 (색 8개 + 상태 색 + 둥글기 + 간격 + 글꼴)
type Font = { id: string; name: string; family: string; css?: string; license?: string };
const stack = (f?: Font) => f ? `"${f.family}", system-ui, sans-serif` : "system-ui, sans-serif";
const css = (c: Company, f?: Font) => {
  const roles = ["primary", "onPrimary", "primarySoft", "surface", "surface2", "text", "muted", "border", "danger", "success", "warning"].filter(k => c[k]);
  const lines = [
    ...roles.map(k => `  --${k}: ${c[k]};`),
    ...Object.entries(c.radius || {}).map(([k, v]) => `  --r-${k}: ${v};`),
    ...Object.entries(c.spacing || {}).map(([k, v]) => `  --sp-${k}: ${v}px;`),
    `  --font-sans: ${stack(f)};`,
  ];
  return `:root{\n${lines.join("\n")}\n}`;
};
// WCAG 대비: 자주 쓰는 네 쌍이 AA(4.5:1)를 넘는지
const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const contrast = (c: Company) => [["본문/표면", "text", "surface"], ["보조 글자/표면", "muted", "surface"], ["강조색 위 글자/강조색", "onPrimary", "primary"], ["강조색/연한 강조색", "primary", "primarySoft"]]
  .map(([n, a, b]) => { const v = ratio(c[a], c[b]); return `${n} ${v.toFixed(2)}:1 ${v >= 4.5 ? "AA 통과" : v >= 3 ? "큰 글자만" : "미달"}`; }).join(" · ");
// 회사 하나를 Claude가 읽기 좋은 글로
const companyText = (c: Company, f?: Font) => [
  `# ${c.name}${c.en ? ` (${c.en})` : ""}${c.dark ? " · 어두운 테마" : ""}${c.unverified ? " · 미검증(출처 검증을 아직 마치지 않은 값이라 공식 값과 다를 수 있어요)" : ""}`,
  `출처: ${c.src} (oh-my-design이 정리한 공개 값, 회사 공식 파일 아님)`,
  c.category && `분야: ${c.category}${c.tags?.length ? ` · 느낌: ${c.tags.join(", ")}` : ""}`,
  f && `글꼴: ${f.name} (${f.license || "-"}) ${f.css ? `<link rel="stylesheet" href="${f.css}">` : ""}`,
  c.type && `타이포(크기/굵기/행간): ${Object.entries(c.type).map(([k, v]) => `${k} ${v}`).join(", ")}`,
  `대비: ${contrast(c)}`,
  css(c, f),
].filter(Boolean).join("\n");

export function makeServer(env: Env, base: string) {
  const server = new McpServer(
    { name: "ui-ref", version: "1.0.0" },
    { instructions: "UI 용어 126개, 회사 디자인 시스템 514개(oh-my-design), React 애니메이션 컴포넌트 코드 61개(Tween UI), 모션 영상 프롬프트 234개를 담은 참고 자료예요. 색·둥글기·글꼴을 회사 스타일로 맞추려면 company, 컴포넌트 이름·동작을 찾으려면 list→get, 말로 물으려면 search를 써요. id 형식: ui-glossary:<용어>, tween:<이름>, motion:<slug>. 디자인 팔레트·디자인 시스템·화면 시안을 만들 때는 색·글꼴을 새로 정하기 전에 company로 참고할 회사(이름 또는 fintech·playful 같은 분야·느낌)를 먼저 가져와 토큰의 출발점으로 쓰고, 결과에 출처(회사 이름)를 적어요." },
  );

  server.registerTool("search", {
    description: "자연어로 물어요 (예: '버튼 옆에 뜨는 작은 메뉴', '탭을 부드럽게 움직이게'). AI가 답과 관련 자료 id를 돌려줘요. 호출마다 비용이 들어요. 이름을 이미 알면 list/get을 먼저 써요.",
    inputSchema: { q: z.string().min(1).max(200), source: z.enum(SOURCES).optional().describe("출처 하나로 좁히기") },
  }, async ({ q, source }) => text(await search(env, q, source)));

  server.registerTool("list", {
    description: "출처별 자료 제목·id를 훑어봐요 (AI 없음). q로 제목을 부분 일치로 거를 수 있어요. 예: source=tween q=tab → Sliding Tabs 등.",
    inputSchema: { source: z.enum(SOURCES), q: z.string().max(100).optional() },
  }, async ({ source, q }) => {
    const { results } = await env.DB.prepare("SELECT id, title, url FROM docs WHERE source = ? AND title LIKE ? ORDER BY title LIMIT 50").bind(source, `%${q ?? ""}%`).all<Doc>();
    return text(results.length ? results.map(d => `${d.id} — ${d.title}`).join("\n") : "없어요.");
  });

  server.registerTool("get", {
    description: "자료 하나의 전문을 읽어요: 용어는 설명·차이·동작 방식, 코드(tween:)는 설명과 React 소스 파일 전부, 영상(motion:)은 프롬프트. 관계(비교 대상·코드 버전·함께 씀)도 같이 와요.",
    inputSchema: { id: z.string().min(3).max(120).describe("예: ui-glossary:tabs, tween:sliding-tabs, motion:<slug>") },
  }, async ({ id }) => {
    const doc = await env.DB.prepare("SELECT id, title, url, source FROM docs WHERE id = ?").bind(id).first<Doc>();
    if (!doc) return fail(`'${id}' 자료가 없어요. list로 id를 찾아요.`);
    doc.text = joinChunks((await env.DB.prepare("SELECT text FROM chunks WHERE doc_id = ? ORDER BY n").bind(id).all<{ text: string }>()).results.map(c => c.text));
    const edges = await edgesAround(env, [id]).catch(() => []);
    const others = [...new Set(edges.map(e => (e.src === id ? e.dst : e.src)))];
    const titles = new Map<string, string>();
    if (others.length) for (const r of (await env.DB.prepare(`SELECT id, title FROM docs WHERE id IN (${others.map(() => "?").join(",")})`).bind(...others).all<Doc>()).results) titles.set(r.id, r.title);
    const related = edges.map(e => { const o = e.src === id ? e.dst : e.src; return `${REL_KO[e.rel] ?? e.rel}: ${titles.get(o) ?? o} (${o})`; });
    const files = doc.source === "tween" ? await asset(env, base, `/UI/tween-code/${id.slice(6)}.json`) as { path: string; content: string }[] | null : null;
    return text([
      `# ${doc.title} [${SOURCE_KO[doc.source] ?? doc.source}] ${new URL(doc.url, base).href}`,
      doc.text,
      related.length && `\n## 관련\n${related.join("\n")}`,
      files?.length && `\n## 코드\n${files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n")}`,
    ].filter(Boolean).join("\n"));
  });

  server.registerTool("company", {
    description: "실제 회사의 디자인 시스템(색 팔레트·상태 색·모서리 둥글기·간격·타이포 스케일·글꼴)을 CSS 변수와 WCAG 대비 결과까지 가져와요. 디자인 팔레트·디자인 시스템·시안을 만들 때 출발점으로 써요. q는 회사 이름(한글·영문·id)이나 분야·느낌 키워드(fintech, consumer, playful, minimal, korean …). 분야·느낌 키워드는 영문이고 74곳에만 있어요. q가 비면 회사 이름 목록만 줘요.",
    inputSchema: { q: z.string().max(60).optional().describe("회사 이름 일부, 또는 분야·느낌 키워드(영문)") },
  }, async ({ q }) => {
    const [all, fonts] = await Promise.all([asset(env, base, "/companies.json") as Promise<Company[] | null>, asset(env, base, "/fonts.json") as Promise<Font[] | null>]);
    if (!all?.length) return fail("회사 자료가 아직 없어요.");
    if (!q) return text(all.map(c => c.name + (c.en && c.en !== c.name ? ` (${c.en})` : "") + (c.category ? ` [${c.category}]` : "")).join(", "));
    const k = q.toLowerCase();
    // 이름 일치가 먼저, 없으면 분야·느낌 키워드로
    let hit = all.filter(c => [c.name, c.en, c.id].some(s => s?.toLowerCase().includes(k)));
    if (!hit.length) hit = all.filter(c => [c.category, ...(c.tags ?? [])].some(s => s?.toLowerCase().includes(k)));
    if (!hit.length) return fail(`'${q}'에 맞는 회사가 없어요. 이름이나 영문 분야·느낌 키워드(fintech, playful …)로 다시 찾아요.`);
    // 6~20곳이면 고를 수 있게 한 줄씩 요약, 그보다 많으면 이름만
    if (hit.length > 20) return text(`${hit.length}곳이 맞아요. 더 좁혀요: ` + hit.map(c => c.name).join(", "));
    if (hit.length > 5) return text(`${hit.length}곳이 맞아요. 하나를 골라 이름으로 다시 불러요:\n` + hit.map(c => `- ${c.name}${c.en ? ` (${c.en})` : ""}${c.category ? ` [${c.category}]` : ""} 강조색 ${c.primary}${c.dark ? " 어두운 테마" : ""}${c.tags?.length ? ` · ${c.tags.slice(0, 4).join(", ")}` : ""}`).join("\n"));
    return text(hit.map(c => companyText(c, fonts?.find(f => f.id === c.font))).join("\n\n"));
  });

  server.registerTool("graph", {
    description: "자료 사이의 관계를 따라가요 (비교 대상·상위 개념·코드 버전·함께 씀). hops=2면 이웃의 이웃까지.",
    inputSchema: { id: z.string().min(3).max(120), hops: z.number().int().min(1).max(2).default(1) },
  }, async ({ id, hops }) => {
    let frontier = [id]; const seen = new Set(frontier); const out: string[] = [];
    for (let h = 0; h < hops && frontier.length; h++) {
      const edges = await edgesAround(env, frontier);
      frontier = [];
      for (const e of edges) { out.push(`${e.src} -${REL_KO[e.rel] ?? e.rel}-> ${e.dst}`); for (const n of [e.src, e.dst]) if (!seen.has(n)) { seen.add(n); frontier.push(n); } }
    }
    return text([...new Set(out)].join("\n") || "관계가 없어요.");
  });

  return server;
}

export const mcpFetch = (req: Request, env: Env) => createMcpHandler(() => makeServer(env, req.url)).fetch(req);
