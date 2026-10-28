import Anthropic from "@anthropic-ai/sdk";
import { mcpFetch } from "./mcp.ts";

// 임베딩 모델을 바꾸면 Vectorize 인덱스 차원도 맞춰야 하고, `npm run ingest -- --full`로 전체를 다시 색인해야 해요.
const EMBED_MODEL = "@cf/baai/bge-m3"; // 한국어를 포함한 다국어 임베딩, 1024차원. 질문-자료 점수 매기기(재정렬)에도 써요.
const CLAUDE_MODEL = "claude-opus-5-5";
const RETRIEVE = 20; // 벡터 검색으로 먼저 고르는 조각 수
const TOP = 10; // 재정렬 후 Claude에 보내는 자료 수
const HOP_PER_SEED = 3, HOP_MAX = 12; // 그래프에서 찾은 자료의 이웃을 이만큼 더 후보에 넣어요
// 관계 이름 (edges.rel) → 사람이 읽는 말
export const REL_KO: Record<string, string> = { compare: "비교 대상", mentions: "관련", code: "코드 버전", uses: "함께 씀", kind_of: "상위 개념" };
// 글에서 관계를 뽑을 때 쓰는 모델과 한 번에 읽는 자료 수. 자료가 바뀐 것만 다시 읽어요
const EXTRACT_MODEL = "claude-sonnet-5-5";
const EXTRACT_SOURCES = ["ui-glossary", "tween"];
const EXTRACT_BATCH = 10;
const EXTRACT_SYSTEM = `당신은 UI 자료 사이의 관계를 찾아요. 각 <자료>를 읽고, <목록>에 있는 다른 자료와의 관계를 적어요.
관계 종류:
- compare: 헷갈리기 쉬워서 차이를 설명하는 상대 (Popover ↔ Tooltip, Switch ↔ Checkbox)
- kind_of: 이 자료가 저 자료의 한 종류 (Alert dialog → Dialog)
- uses: 이 자료 안에 저 부품이 들어가거나 함께 쓰임 (Dialog → Button)
- code: 코드 컴포넌트가 어떤 용어의 움직이는 버전인지 (Sliding Tabs → Tabs)
규칙: 자료 본문에 근거가 있는 것만, 자료당 최대 6개, 자기 자신은 빼요. dst는 반드시 <목록>의 id예요. why는 한 문장이에요.`;
const MAX_QUESTION = 200;
const EMBED_BATCH = 50;

const SYSTEM = `당신은 개발 참고 자료 검색 도우미예요. 사용자의 질문에 맞는 자료를 <자료>에서 골라 답해요.
- <자료>에 있는 내용만 근거로 답해요. 없는 내용은 지어내지 말고, 맞는 자료가 없으면 results를 비우고 answer에 그렇게 적어요.
- answer: 질문에 대한 답을 2~3문장으로 적어요. 디자이너나 개발자가 아닌 사람도 이해할 수 있는 쉬운 한국어로, 꾸밈말 없이 간결하게 써요.
- results: 질문과 관련 있는 자료만, 관련도가 높은 순서로 최대 5개 골라요. reason에는 이 자료가 왜 맞는지 한 문장으로 적어요.
- <관계>는 자료 사이의 연결이에요. 두 항목의 차이나 "이 부품의 움직이는 버전" 같은 질문에는 관계를 따라 답하고, 관계가 있는 자료는 함께 골라요.`;

type Chunk = { n: number; text: string };
type DocIn = { id: string; source: string; title: string; url: string; hash: string; chunks: Chunk[] };
type Row = { vector_id: string; doc_id: string; text: string; title: string; url: string; source: string };
type Edge = { src: string; rel: string; dst: string; weight: number };
type Related = { id: string; title: string; url: string; source: string; rel: string };

const enc = new TextEncoder();

async function vectorId(docId: string, n: number) {
  // Vectorize id는 64바이트 제한이 있어서 문서 id를 해시로 줄여요
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(docId)));
  return `${[...h.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("")}#${n}`;
}

async function embed(env: Env, texts: string[]) {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + EMBED_BATCH), truncate_inputs: true });
    if (!("data" in res) || !res.data) throw new Error("임베딩 응답 형식이 예상과 달라요");
    out.push(...res.data);
  }
  return out;
}

const placeholders = (n: number) => Array(n).fill("?").join(",");

// ───── 그래프 ─────
// 마이그레이션 없이도 동작하게 Worker가 표를 만들어요 (migrations/0002_graph.sql과 같은 모양)
// origin: data(데이터에 적힌 관계) / ai(글에서 Claude가 뽑은 관계). extracted는 자료별로 어떤 내용을 읽었는지(해시) 기억해요
async function ensureEdges(env: Env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS edges (src TEXT NOT NULL, rel TEXT NOT NULL, dst TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, PRIMARY KEY (src, rel, dst))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS extracted (doc_id TEXT PRIMARY KEY, hash TEXT NOT NULL, extracted_at TEXT NOT NULL)"),
  ]);
  await env.DB.prepare("ALTER TABLE edges ADD COLUMN origin TEXT NOT NULL DEFAULT 'data'").run().catch(() => {}); // 이미 있으면 넘어가요
}

// 주어진 자료들에 닿아 있는 관계를 모두 가져와요 (양방향)
export async function edgesAround(env: Env, ids: string[]) {
  if (!ids.length) return [] as Edge[];
  const ph = placeholders(ids.length);
  const { results } = await env.DB.prepare(`SELECT src, rel, dst, weight FROM edges WHERE src IN (${ph}) OR dst IN (${ph})`).bind(...ids, ...ids).all<Edge>();
  return results;
}

// ───── 검색 ─────
export async function search(env: Env, q: string, source?: string) {
  const empty = { answer: "관련 자료를 찾지 못했어요. 다른 말로 다시 물어봐 주세요.", results: [] };
  const [vec] = await embed(env, [q]);
  const found = await env.VECTORIZE.query(vec, { topK: RETRIEVE, ...(source ? { filter: { source } } : {}) });
  if (!found.matches.length) return empty;

  const vids = found.matches.map(m => m.id);
  const { results: rows } = await env.DB.prepare(
    `SELECT c.vector_id, c.doc_id, c.text, d.title, d.url, d.source FROM chunks c JOIN docs d ON d.id = c.doc_id WHERE c.vector_id IN (${placeholders(vids.length)})`,
  ).bind(...vids).all<Row>();
  if (!rows.length) return empty;

  // 그래프: 찾은 자료의 이웃을 한 단계 더 후보에 넣어요 (관계가 센 것부터, 자료당 몇 개까지만)
  const seeds = [...new Set(rows.map(r => r.doc_id))];
  const edges = await edgesAround(env, seeds).catch(() => [] as Edge[]); // 표가 아직 없으면 그냥 넘어가요
  // 벡터 점수가 높은 자료부터 이웃을 채워요 (seeds는 점수 순서예요)
  const hop: string[] = [];
  for (const seed of seeds) {
    let n = 0;
    for (const e of edges.filter(e => e.src === seed || e.dst === seed).sort((a, b) => b.weight - a.weight)) {
      const other = e.src === seed ? e.dst : e.src;
      if (seeds.includes(other) || hop.includes(other) || hop.length >= HOP_MAX || n >= HOP_PER_SEED) continue;
      hop.push(other); n++;
    }
  }
  if (hop.length) {
    const { results: more } = await env.DB.prepare(
      `SELECT c.vector_id, c.doc_id, c.text, d.title, d.url, d.source FROM chunks c JOIN docs d ON d.id = c.doc_id WHERE c.n = 0 AND c.doc_id IN (${placeholders(hop.length)})${source ? " AND d.source = ?" : ""}`,
    ).bind(...hop, ...(source ? [source] : [])).all<Row>();
    rows.push(...more);
  }

  // 질문과 각 조각을 직접 비교해 순서를 다시 정하고, 문서당 가장 잘 맞는 조각 하나만 남겨요
  const scored = await env.AI.run(EMBED_MODEL, { query: q, contexts: rows.map(r => ({ text: `${r.title}\n${r.text}` })) });
  const order = ("response" in scored && scored.response ? scored.response : [])
    .filter((s): s is { id?: number; score?: number } => !Array.isArray(s));
  const ranked = [...order].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(s => rows[s.id ?? -1]).filter(Boolean);
  const top: Row[] = [];
  for (const r of ranked.length ? ranked : rows) {
    if (!top.some(t => t.doc_id === r.doc_id)) top.push(r);
    if (top.length === TOP) break;
  }

  // 고른 자료들 사이의 관계만 Claude에게 보여줘요
  const topIds = new Set(top.map(t => t.doc_id)), titleOf = new Map(rows.map(r => [r.doc_id, r.title]));
  const links = edges.filter(e => topIds.has(e.src) && topIds.has(e.dst));
  const relText = links.length ? `\n<관계>\n${links.map(e => `${titleOf.get(e.src)} —${REL_KO[e.rel] ?? e.rel}→ ${titleOf.get(e.dst)}`).join("\n")}\n</관계>` : "";

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            results: {
              type: "array",
              items: {
                type: "object",
                // 이번 검색에서 찾은 자료 id만 고를 수 있어요
                properties: { id: { type: "string", enum: top.map(t => t.doc_id) }, reason: { type: "string" } },
                required: ["id", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["answer", "results"],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `질문: ${q}\n\n<자료>\n${top.map(t => `<doc id="${t.doc_id}">\n제목: ${t.title}\n${t.text}\n</doc>`).join("\n")}\n</자료>${relText}`,
    }],
  });

  if (msg.stop_reason === "refusal") return { answer: "이 질문에는 답할 수 없어요.", results: [] };
  const block = msg.content.find(b => b.type === "text");
  if (!block || block.type !== "text") throw new Error("응답에 텍스트가 없어요");
  const parsed = JSON.parse(block.text) as { answer: string; results: { id: string; reason: string }[] };
  const byId = new Map<string, { title: string; url: string; source: string }>(rows.map(r => [r.doc_id, r]));
  // 결과마다 이어지는 자료를 칩으로 붙여요. 후보에 없던 이웃은 제목만 따로 가져와요
  const picked = parsed.results.map(r => r.id).filter(id => byId.has(id));
  const near = edges.filter(e => picked.includes(e.src) || picked.includes(e.dst));
  const missing = [...new Set(near.flatMap(e => [e.src, e.dst]))].filter(id => !byId.has(id));
  if (missing.length) {
    const { results: docs } = await env.DB.prepare(`SELECT id, title, url, source FROM docs WHERE id IN (${placeholders(missing.length)})`).bind(...missing).all<{ id: string; title: string; url: string; source: string }>();
    for (const d of docs) byId.set(d.id, d);
  }
  const relatedOf = (id: string): Related[] => near
    .filter(e => e.src === id || e.dst === id)
    .map(e => ({ other: e.src === id ? e.dst : e.src, rel: e.rel }))
    .filter(x => byId.has(x.other) && x.other !== id)
    .slice(0, 4)
    .map(x => { const d = byId.get(x.other)!; return { id: x.other, title: d.title, url: d.url, source: d.source, rel: REL_KO[x.rel] ?? x.rel }; });
  return {
    answer: parsed.answer,
    results: parsed.results.filter(r => byId.has(r.id)).map(r => {
      const t = byId.get(r.id)!;
      return { id: r.id, title: t.title, source: t.source, url: t.url, reason: r.reason, related: relatedOf(r.id) };
    }),
  };
}

// ───── AI 팔레트 ─────
const PALETTE_ROLES = ["primary", "onPrimary", "primarySoft", "surface", "surface2", "text", "muted", "border"] as const;
type Palette = { name: string } & Record<(typeof PALETTE_ROLES)[number], string>;

const PALETTE_SYSTEM = `당신은 UI 예시 화면에 쓸 색 팔레트를 만들어요. 밝은 화면 기준이에요.
역할:
- primary: 버튼·스위치·선택 표시에 쓰는 강조색
- onPrimary: primary 위에 올리는 글자색
- primarySoft: primary를 아주 연하게 만든 배경 (연한 버튼, 선택된 칩)
- surface: 카드·입력칸 배경 (아주 밝게)
- surface2: surface보다 조금 어두운 보조 배경
- text: 본문 글자색 (아주 어둡게)
- muted: 보조 글자색
- border: 테두리
지켜야 할 대비: text와 muted는 surface 위에서, onPrimary는 primary 위에서, primary는 primarySoft 위에서 각각 4.5:1 이상.
name은 팔레트 분위기를 담은 한국어 2~6글자.`;

const hexRgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c: number[]) => "#" + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const luminance = (h: string) => {
  const [r, g, b] = hexRgb(h).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (a: string, b: string, t: number) => { const [x, y] = [hexRgb(a), hexRgb(b)]; return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
// fg를 bg와 min:1이 될 때까지 검정(또는 흰색) 쪽으로 조금씩 옮겨요
function ensure(fg: string, bg: string, toward: string, min = 4.5) {
  for (let t = 0; t <= 1 && contrast(fg, bg) < min; t += 0.05) fg = mix(fg, toward, t);
  return fg;
}

async function makePalette(env: Env, prompt: string) {
  const hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { name: { type: "string" }, ...Object.fromEntries(PALETTE_ROLES.map(r => [r, hex])) },
          required: ["name", ...PALETTE_ROLES],
          additionalProperties: false,
        },
      },
    },
    system: PALETTE_SYSTEM,
    messages: [{ role: "user", content: `원하는 느낌: ${prompt}` }],
  });
  if (msg.stop_reason === "refusal") return { error: "이 설명으로는 팔레트를 만들 수 없어요. 다른 말로 써 주세요.", status: 422 };
  const block = msg.content.find(b => b.type === "text");
  if (!block || block.type !== "text") throw new Error("응답에 텍스트가 없어요");
  const p = JSON.parse(block.text) as Palette;
  for (const r of PALETTE_ROLES) if (!/^#[0-9a-fA-F]{6}$/.test(p[r])) throw new Error(`잘못된 색: ${r}`);

  // 모델이 대비를 못 맞춰도 글자가 보이게 Worker에서 보정해요
  const before = { ...p };
  const darkSurface = luminance(p.surface) < 0.4;
  const ink = darkSurface ? "#ffffff" : "#000000";
  p.text = ensure(p.text, p.surface, ink, 7); // 본문은 보조 글자보다 항상 진하게
  p.muted = ensure(p.muted, p.surface, ink);
  p.onPrimary = contrast("#ffffff", p.primary) >= contrast("#111111", p.primary) ? "#ffffff" : "#111111";
  if (contrast(p.onPrimary, p.primary) < 4.5) p.primary = ensure(p.primary, p.onPrimary, p.onPrimary === "#ffffff" ? "#000000" : "#ffffff");
  // 강조색 글자를 연한 배경 위에 쓰는 경우(연한 버튼 등). 강조색 자체가 밝아서 흰 배경에서도 4.5:1이 안 되면 맞출 수 없어 그대로 둬요
  if (contrast(p.primary, darkSurface ? "#000000" : "#ffffff") >= 4.5) p.primarySoft = ensure(p.primarySoft, p.primary, darkSurface ? "#000000" : "#ffffff");
  const adjusted = PALETTE_ROLES.filter(r => p[r].toLowerCase() !== before[r].toLowerCase());
  return { palette: { name: p.name.slice(0, 12), ...Object.fromEntries(PALETTE_ROLES.map(r => [r, p[r].toLowerCase()])) }, adjusted };
}

// ───── 색인 (관리자 전용) ─────
async function getMeta(env: Env, key: string) {
  return (await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{ value: string }>())?.value;
}
const setMeta = (env: Env, key: string, value: string) =>
  env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(key, value);

async function plan(env: Env, body: { docs: { id: string; hash: string }[]; full?: boolean }) {
  const { results: existing } = await env.DB.prepare("SELECT id, hash FROM docs").all<{ id: string; hash: string }>();
  const model = await getMeta(env, "embed_model");
  if (existing.length && model !== EMBED_MODEL && !body.full) {
    return { error: `임베딩 모델이 ${model} → ${EMBED_MODEL}로 바뀌었어요. --full 옵션으로 전체를 다시 색인하세요.`, status: 409 };
  }
  const old = new Map(existing.map(d => [d.id, d.hash]));
  const incoming = new Set(body.docs.map(d => d.id));
  const changed = body.docs.filter(d => body.full || old.get(d.id) !== d.hash).map(d => d.id);
  return {
    changed,
    added: changed.filter(id => !old.has(id)).length,
    updated: changed.filter(id => old.has(id)).length,
    deleted: existing.map(d => d.id).filter(id => !incoming.has(id)),
  };
}

async function upsert(env: Env, docs: DocIn[]) {
  const { results: oldRows } = await env.DB.prepare(`SELECT vector_id FROM chunks WHERE doc_id IN (${placeholders(docs.length)})`)
    .bind(...docs.map(d => d.id)).all<{ vector_id: string }>();
  const items = await Promise.all(docs.flatMap(d => d.chunks.map(async c => ({ vid: await vectorId(d.id, c.n), d, c }))));
  const keep = new Set(items.map(x => x.vid));
  const stale = oldRows.map(r => r.vector_id).filter(v => !keep.has(v)); // 문서가 짧아져 남는 조각
  if (stale.length) await env.VECTORIZE.deleteByIds(stale);

  const values = await embed(env, items.map(x => `${x.d.title}\n${x.c.text}`));
  await env.VECTORIZE.upsert(items.map((x, i) => ({ id: x.vid, values: values[i], metadata: { docId: x.d.id, source: x.d.source, n: x.c.n } })));

  const now = new Date().toISOString();
  await env.DB.batch([
    ...docs.flatMap(d => [
      env.DB.prepare("DELETE FROM chunks WHERE doc_id = ?").bind(d.id),
      env.DB.prepare("INSERT OR REPLACE INTO docs (id, source, title, url, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(d.id, d.source, d.title, d.url, d.hash, now),
    ]),
    ...items.map(x => env.DB.prepare("INSERT INTO chunks (vector_id, doc_id, n, text) VALUES (?, ?, ?, ?)").bind(x.vid, x.d.id, x.c.n, x.c.text)),
    setMeta(env, "embed_model", EMBED_MODEL),
    setMeta(env, "indexed_at", now),
  ]);
  return { upserted: docs.length, chunks: items.length };
}

async function remove(env: Env, ids: string[]) {
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const { results } = await env.DB.prepare(`SELECT vector_id FROM chunks WHERE doc_id IN (${placeholders(part.length)})`)
      .bind(...part).all<{ vector_id: string }>();
    if (results.length) await env.VECTORIZE.deleteByIds(results.map(r => r.vector_id));
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM chunks WHERE doc_id IN (${placeholders(part.length)})`).bind(...part),
      env.DB.prepare(`DELETE FROM docs WHERE id IN (${placeholders(part.length)})`).bind(...part),
    ]);
  }
  return { deleted: ids.length };
}

// 사이트가 모달에 '관련' 칩을 그릴 때 쓰는 그래프 전체 (관계 + 관계에 나오는 자료의 제목·주소)
async function graphAll(env: Env) {
  await ensureEdges(env);
  const { results: edges } = await env.DB.prepare("SELECT src, rel, dst, origin FROM edges").all<{ src: string; rel: string; dst: string; origin: string }>();
  const ids = [...new Set(edges.flatMap(e => [e.src, e.dst]))];
  const nodes: Record<string, { title: string; url: string; source: string }> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const { results } = await env.DB.prepare(`SELECT id, title, url, source FROM docs WHERE id IN (${placeholders(part.length)})`).bind(...part).all<{ id: string; title: string; url: string; source: string }>();
    for (const d of results) nodes[d.id] = { title: d.title, url: d.url, source: d.source };
  }
  return { nodes, edges };
}

// 관계 전체를 받아 바꿔 넣어요. 내용 해시가 같으면 건너뛰어요
async function putEdges(env: Env, body: { hash: string; edges: Edge[] }) {
  await ensureEdges(env);
  if ((await getMeta(env, "edges_hash")) === body.hash) return { edges: body.edges.length, unchanged: true };
  await env.DB.batch([env.DB.prepare("DELETE FROM edges WHERE origin = 'data'")]);
  for (let i = 0; i < body.edges.length; i += 100) {
    await env.DB.batch(body.edges.slice(i, i + 100).map(e =>
      env.DB.prepare("INSERT OR REPLACE INTO edges (src, rel, dst, weight, origin) VALUES (?, ?, ?, ?, 'data')").bind(e.src, e.rel, e.dst, e.weight ?? 1)));
  }
  await env.DB.batch([setMeta(env, "edges_hash", body.hash)]);
  return { edges: body.edges.length, unchanged: false };
}

// 글에서 관계 뽑기: 아직 안 읽었거나 내용이 바뀐 자료 목록
async function extractPlan(env: Env) {
  await ensureEdges(env);
  const { results } = await env.DB.prepare(
    `SELECT d.id FROM docs d LEFT JOIN extracted x ON x.doc_id = d.id WHERE d.source IN (${placeholders(EXTRACT_SOURCES.length)}) AND (x.hash IS NULL OR x.hash != d.hash) ORDER BY d.id`,
  ).bind(...EXTRACT_SOURCES).all<{ id: string }>();
  return { ids: results.map(r => r.id), batch: EXTRACT_BATCH };
}

// 자료 묶음(최대 EXTRACT_BATCH개)을 Claude에게 읽혀 관계를 뽑고, 그 자료의 이전 ai 관계를 바꿔 넣어요
async function extract(env: Env, ids: string[]) {
  await ensureEdges(env);
  ids = [...new Set(ids)].slice(0, EXTRACT_BATCH);
  if (!ids.length) return { extracted: 0, edges: 0 };
  const { results: catalog } = await env.DB.prepare(`SELECT id, title FROM docs WHERE source IN (${placeholders(EXTRACT_SOURCES.length)}) ORDER BY id`).bind(...EXTRACT_SOURCES).all<{ id: string; title: string }>();
  const { results: docs } = await env.DB.prepare(
    `SELECT d.id, d.title, d.hash, c.text FROM docs d JOIN chunks c ON c.doc_id = d.id AND c.n = 0 WHERE d.id IN (${placeholders(ids.length)})`,
  ).bind(...ids).all<{ id: string; title: string; hash: string; text: string }>();
  if (!docs.length) return { extracted: 0, edges: 0 };
  const catalogIds = catalog.map(c => c.id);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const msg = await client.beta.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  src: { type: "string", enum: docs.map(d => d.id) },
                  rel: { type: "string", enum: ["compare", "kind_of", "uses", "code"] },
                  dst: { type: "string", enum: catalogIds },
                  why: { type: "string" },
                },
                required: ["src", "rel", "dst", "why"],
                additionalProperties: false,
              },
            },
          },
          required: ["relations"],
          additionalProperties: false,
        },
      },
    },
    system: EXTRACT_SYSTEM,
    messages: [{
      role: "user",
      content: `<목록>\n${catalog.map(c => `${c.id} | ${c.title}`).join("\n")}\n</목록>\n\n${docs.map(d => `<자료 id="${d.id}">\n${d.text}\n</자료>`).join("\n")}`,
    }],
  });
  const block = msg.content.find(b => b.type === "text");
  if (msg.stop_reason === "refusal" || !block || block.type !== "text") throw new Error("관계를 뽑지 못했어요");
  const { relations } = JSON.parse(block.text) as { relations: { src: string; rel: string; dst: string; why: string }[] };
  const WEIGHT: Record<string, number> = { compare: 1, kind_of: 1, code: 1, uses: 0.7 };
  const good = relations.filter(r => r.src !== r.dst && docs.some(d => d.id === r.src) && catalogIds.includes(r.dst)).slice(0, docs.length * 6);

  const now = new Date().toISOString();
  await env.DB.batch([
    ...docs.map(d => env.DB.prepare("DELETE FROM edges WHERE origin = 'ai' AND src = ?").bind(d.id)),
    // 데이터에 이미 있는 같은 관계는 그대로 두고(IGNORE), 새 것만 넣어요
    ...good.map(r => env.DB.prepare("INSERT OR IGNORE INTO edges (src, rel, dst, weight, origin) VALUES (?, ?, ?, ?, 'ai')").bind(r.src, r.rel, r.dst, WEIGHT[r.rel] ?? 0.7)),
    ...docs.map(d => env.DB.prepare("INSERT OR REPLACE INTO extracted (doc_id, hash, extracted_at) VALUES (?, ?, ?)").bind(d.id, d.hash, now)),
  ]);
  return { extracted: docs.length, edges: good.length };
}

async function stats(env: Env) {
  const { results } = await env.DB.prepare("SELECT source, COUNT(*) AS docs FROM docs GROUP BY source").all();
  const { results: edges } = await env.DB.prepare("SELECT origin, COUNT(*) AS n FROM edges GROUP BY origin").all<{ origin: string; n: number }>().catch(() => ({ results: [] }));
  return { sources: results, edges, embedModel: await getMeta(env, "embed_model"), indexedAt: await getMeta(env, "indexed_at") };
}

// ───── HTTP ─────
function corsHeaders(req: Request, env: Env): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  if (origin === null) return {}; // 브라우저가 아닌 요청(curl, 색인 스크립트)
  if (!env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

function isAdmin(req: Request, env: Env) {
  if (!env.ADMIN_TOKEN) return false;
  const got = enc.encode(req.headers.get("Authorization") ?? "");
  const want = enc.encode(`Bearer ${env.ADMIN_TOKEN}`);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}

export default {
  async fetch(req, env) {
    const { pathname, hostname } = new URL(req.url);
    const isAdminPath = pathname.startsWith("/ingest/") || pathname === "/stats";
    // 페이지·검색은 Access로 잠긴 사이트 주소에서만 열어요. 다른 주소(workers.dev)는 관리용 경로만 받아요.
    if (hostname !== env.SITE_HOST && !isAdminPath) return new Response("Not found", { status: 404 });
    if (hostname === env.SITE_HOST && pathname === "/") return Response.redirect(new URL("/UI/ui-glossary.html", req.url).href, 302);
    if (hostname === env.SITE_HOST && pathname === "/mcp") return mcpFetch(req, env); // 다른 프로젝트의 Claude Code용 (src/mcp.ts)
    if (hostname === env.SITE_HOST && pathname === "/graph" && req.method === "GET") {
      return Response.json(await graphAll(env), { headers: { "Cache-Control": "public, max-age=300" } }); // 5분 캐시
    }
    if (hostname === env.SITE_HOST && pathname !== "/search" && pathname !== "/palette" && !isAdminPath) {
      const res = await env.ASSETS.fetch(req);
      if (!pathname.endsWith(".md") || !res.ok) return res;
      // 마크다운 문서는 내려받지 않고 브라우저에서 바로 읽히게 텍스트로 보내요
      const headers = new Headers(res.headers);
      headers.set("Content-Type", "text/plain; charset=utf-8");
      return new Response(res.body, { status: res.status, headers });
    }

    const cors = corsHeaders(req, env);
    if (!cors) return Response.json({ error: "허용되지 않은 출처예요." }, { status: 403 });
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (pathname === "/search" && req.method === "POST") {
        const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
        if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return reply({ error: "잠시 후 다시 시도해 주세요. (1분에 10회까지)" }, 429);
        const body = await req.json<{ q?: unknown; source?: unknown }>().catch(() => ({} as { q?: unknown; source?: unknown }));
        const q = typeof body.q === "string" ? body.q.trim() : "";
        if (!q || q.length > MAX_QUESTION) return reply({ error: `질문은 1~${MAX_QUESTION}자로 입력해 주세요.` }, 400);
        const source = typeof body.source === "string" && body.source.length <= 64 ? body.source : undefined;
        return reply(await search(env, q, source));
      }

      if (pathname === "/palette" && req.method === "POST") {
        const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
        if (!(await env.RATE_LIMITER.limit({ key: ip })).success) return reply({ error: "잠시 후 다시 시도해 주세요. (1분에 10회까지)" }, 429);
        const body = await req.json<{ prompt?: unknown }>().catch(() => ({} as { prompt?: unknown }));
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt || prompt.length > 100) return reply({ error: "원하는 느낌을 1~100자로 써 주세요." }, 400);
        const r = await makePalette(env, prompt);
        return "error" in r ? reply({ error: r.error }, r.status) : reply(r);
      }

      if (isAdminPath) {
        if (!isAdmin(req, env)) return reply({ error: "인증이 필요해요." }, 401);
        if (pathname === "/stats" && req.method === "GET") return reply(await stats(env));
        if (req.method !== "POST") return reply({ error: "POST만 지원해요." }, 405);
        const body = await req.json<any>();
        if (pathname === "/ingest/plan") {
          const p = await plan(env, body);
          return "error" in p ? reply({ error: p.error }, p.status) : reply(p);
        }
        if (pathname === "/ingest/upsert") return reply(await upsert(env, body.docs));
        if (pathname === "/ingest/delete") return reply(await remove(env, body.ids));
        if (pathname === "/ingest/edges") return reply(await putEdges(env, body));
        if (pathname === "/ingest/extract-plan") return reply(await extractPlan(env));
        if (pathname === "/ingest/extract") return reply(await extract(env, body.ids ?? []));
      }
      return reply({ error: "없는 경로예요." }, 404);
    } catch (err) {
      console.error(err);
      if (err instanceof Anthropic.RateLimitError) return reply({ error: "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." }, 503);
      if (err instanceof Anthropic.APIError) return reply({ error: "AI 응답을 받지 못했어요." }, 502);
      return reply({ error: "서버 오류가 났어요." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
