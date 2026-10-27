import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// 페이지와 AI 검색을 여는 주소. Cloudflare Access로 본인 이메일만 들어올 수 있어요.
const SITE_HOST = "ui.leo0409.work";

export default defineConfig({
  worker: {
    name: "dev-reference-ai-search",
    compatibilityDate: "2026-10-27",
    entrypoint,
    domains: [SITE_HOST],
    // workers.dev 주소는 자료 업로드(/ingest, /stats)에만 써요. 페이지와 검색은 Worker가 거절해요.
    workersDev: true,
    previewUrls: false,
    // 모든 요청을 Worker가 먼저 받아서, 주소에 따라 페이지를 보여줄지 정해요
    assets: { runWorkerFirst: true },
    env: {
      ASSETS: bindings.assets(),
      AI: bindings.ai({ dev: { remote: true } }),
      VECTORIZE: bindings.vectorize({ name: "dev-reference", dev: { remote: true } }),
      DB: bindings.d1({ name: "dev-reference" }),
      // 검색 요청: IP당 1분에 10회
      RATE_LIMITER: bindings.rateLimit({ namespace: "1001", simple: { limit: 10, period: 60 } }),
      SITE_HOST: bindings.text(SITE_HOST),
      // 검색을 허용할 페이지 출처(쉼표로 구분)
      ALLOWED_ORIGINS: bindings.text(`https://${SITE_HOST}`),
      ANTHROPIC_API_KEY: bindings.secret(),
      ADMIN_TOKEN: bindings.secret(),
    },
  },
});
