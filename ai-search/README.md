# 개발 참고 자료 AI 검색

**사이트: https://ui.leo0409.work** (Cloudflare Access로 잠겨 있어 본인 계정으로 로그인해야 열려요)

이 Worker가 하는 일:
- `ui.leo0409.work`: 용어 사전 페이지와 `.md` 문서를 보여주고, 페이지의 "✦ AI에게 묻기"(`/search`)에 답해요.
- `dev-reference-ai-search.tpals0409dev.workers.dev`: 자료 업로드(`/ingest`, `/stats`)만 받아요(`ADMIN_TOKEN` 필요). 페이지와 검색은 404예요.
- 로컬 파일로 연 html에서는 AI 버튼이 숨겨져요.

`npm run deploy`는 `scripts/build-site.mjs`로 html과 `.md` 문서를 `public/`에 모은 뒤 배포해요. 문서를 고쳤다면 `npm run deploy`(사이트 반영)와 `npm run ingest`(검색 반영)를 둘 다 실행해요.

---

`UI/ui-glossary.html` 검색창의 "✦ AI에게 묻기"가 호출하는 Cloudflare Worker예요.
질문을 받으면 관련 자료를 찾아(RAG) Claude가 짧게 답하고, 근거가 된 자료 목록을 돌려줘요.

```
질문 → 임베딩(Workers AI bge-m3) → Vectorize 상위 20개 → 재정렬 → 상위 8개 → Claude Opus 5.5 → 답변 + 자료 목록
```

- API 키는 Worker의 secret에만 있어요. html에는 Worker 주소만 들어가요.
- 비용: 질문 1회에 약 1~2센트(Claude) + Workers AI 소량. 자료가 늘어도 Claude에는 상위 8개만 보내서 거의 그대로예요.

## 처음 설치 (한 번만)

```bash
npm install
cf auth login
```

Vectorize 인덱스 만들기 (배포 전에 있어야 해요. 이름은 `cloudflare.config.ts`와 같아야 해요):

```bash
npx cf vectorize create --name dev-reference --config-dimensions 1024 --config-metric cosine
npx cf vectorize metadata-index create dev-reference --property-name source --index-type string
```

> 메타데이터 인덱스는 **자료를 올리기 전에** 만들어야 출처 필터가 동작해요.
> D1 데이터베이스는 첫 배포 때 자동으로 만들어져요. 표 만들기는 아래 첫 배포 다음에 해요.

첫 배포 — 새 Worker는 비밀값을 파일로 함께 올려야 해요:

1. 편집기로 `.env.secrets` 파일을 만들고 두 줄을 적어요 (`.gitignore`에 포함돼 있어요):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ADMIN_TOKEN=...
   ```
   - `ANTHROPIC_API_KEY`: console.anthropic.com → API Keys → Create Key로 발급한 키. 같은 콘솔의 Billing에 크레딧이 있어야 호출돼요.
   - `ADMIN_TOKEN`: 자료 업로드용 비밀번호. 예: `openssl rand -hex 32`로 만든 값을 따로 보관해 두세요.
2. 배포하고, 바로 파일을 지워요:
   ```bash
   npx cf deploy --secrets-file .env.secrets
   rm .env.secrets
   ```

3. D1에 표를 만들어요 (ID는 `npx cf d1 list`에서 `dev-reference`의 `uuid`):
   ```bash
   npx cf d1 migrations apply <uuid>
   ```

이후 배포는 `npm run deploy`만 하면 돼요. 비밀값을 바꿀 때는 `npx wrangler secret put ANTHROPIC_API_KEY --name dev-reference-ai-search` (입력창에 값을 넣어요, 즉시 반영).

## 자료 올리기

```bash
AI_SEARCH_URL=https://dev-reference-ai-search.<계정>.workers.dev ADMIN_TOKEN=<값> npm run ingest
```

바뀐 문서만 다시 임베딩해요. 업로드 없이 추출 결과만 보려면 `npm run ingest -- --dry-run`.

마지막으로 `UI/ui-glossary.html`의 `const AI_ENDPOINT=''`에 Worker 주소를 넣으면 AI 버튼이 나타나요.

## 자료 추가하기

| 하고 싶은 것 | 방법 |
|---|---|
| UI 용어 추가·수정 | html의 `add(...)`와 `HOW`를 고친 뒤 `npm run ingest` |
| 새 문서 추가 | 아무 폴더(결제, 로그인, 인프라 …)에 `.md` 파일을 넣고 `npm run ingest`. `## 제목` 단위로 나뉘어 검색돼요 |
| 문서 삭제 | 파일을 지우고 `npm run ingest` (검색에서도 지워져요) |
| 새 종류의 자료(PDF 등) | `extractors/`에 추출기를 만들고 `sources.config.mjs`에 등록 |

추출기는 `{ id, source, title, text, url, tags }` 모양의 배열만 돌려주면 돼요. `url`은 `개발 체크리스트` 폴더 기준 경로예요.

## 설정

- 허용할 페이지 출처: `cloudflare.config.ts`의 `ALLOWED_ORIGINS` (기본값 `null` = 로컬에서 연 html 파일). 페이지를 호스팅하면 그 주소를 쉼표로 추가해요.
- 요청 제한: IP당 1분에 10회 (`RATE_LIMITER`)
- 임베딩 모델을 바꾸면 Vectorize 인덱스를 새 차원으로 다시 만들고 `npm run ingest -- --full`을 실행해요.

## 관리용 API (`Authorization: Bearer <ADMIN_TOKEN>` 필요)

- `GET /stats` — 출처별 문서 수, 임베딩 모델, 마지막 색인 시각
- `POST /ingest/plan`, `/ingest/upsert`, `/ingest/delete` — `npm run ingest`가 사용
