# 개발 참고 자료 AI 검색

**사이트: https://ui.leo0409.work** (Cloudflare Access로 잠겨 있어 본인 계정으로 로그인해야 열려요)

이 Worker가 하는 일:
- `ui.leo0409.work`: 용어 사전 페이지와 `.md` 문서를 보여주고, 페이지의 "✦ AI에게 묻기"(`/search`)에 답해요.
- `dev-reference-ai-search.tpals0409dev.workers.dev`: 자료 업로드(`/ingest`, `/stats`)만 받아요(`ADMIN_TOKEN` 필요). 페이지와 검색은 404예요.
- 로컬 파일로 연 html에서는 AI 버튼이 숨겨져요.

`main`에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 배포와 검색 색인 갱신을 자동으로 해요. 로컬에서 직접 하려면 `npm run deploy`(사이트 반영)와 `npm run ingest`(검색 반영)를 실행해요. `npm run deploy`는 `scripts/build-site.mjs`로 html과 `.md` 문서를 `public/`에 모은 뒤 배포해요. 외부 자료(회사 팔레트·모션 예시·애니메이션 코드)는 받아오면 `data/*.json`에 저장하고, 못 받으면 저장해 둔 것을 그대로 써요.

GitHub Actions의 `CLOUDFLARE_API_TOKEN` 권한: Account — Workers Scripts Edit, Account Settings Read, D1 Read, Vectorize Read, Workers AI Read / Zone(leo0409.work) — Workers Routes Edit, Zone Read, DNS Read.

---

`UI/ui-glossary.html` 검색창의 "✦ AI에게 묻기"가 호출하는 Cloudflare Worker예요.
질문을 받으면 관련 자료를 찾아(RAG) Claude가 짧게 답하고, 근거가 된 자료 목록을 돌려줘요.

```
질문 → 임베딩(Workers AI bge-m3) → Vectorize 상위 20개 (+ 관계 그래프 이웃) → 재정렬 → 상위 10개 → Claude Sonnet 5.5 → 답변 + 자료 목록
```

- API 키는 Worker의 secret에만 있어요. html에는 Worker 주소만 들어가요.
- 비용: 질문 1회에 약 1~2센트(Claude) + Workers AI 소량. 자료가 늘어도 Claude에는 상위 10개만 보내서 거의 그대로예요.
- 같은 질문(대소문자·공백 차이 무시)은 D1의 `answers` 표에서 바로 답해요 (Claude 호출 0). 색인이나 관계가 바뀌면 표를 비워요.

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

이후 배포는 `npm run deploy`만 하면 돼요. `migrations/`에 새 파일이 생기면 위 `migrations apply`를 한 번 더 실행해요 (표가 없으면 그 기능만 조용히 건너뛰어요). 비밀값을 바꿀 때는 `npx wrangler secret put ANTHROPIC_API_KEY --name dev-reference-ai-search` (입력창에 값을 넣어요, 즉시 반영).

## 자료 올리기

```bash
AI_SEARCH_URL=https://dev-reference-ai-search.<계정>.workers.dev ADMIN_TOKEN=<값> npm run ingest
```

바뀐 문서만 다시 임베딩해요. 업로드 없이 추출 결과만 보려면 `npm run ingest -- --dry-run`.

AI 버튼은 사이트(`https://` 주소)에서 열 때 자동으로 나타나요. 로컬 파일로 열면 숨겨져요.

## 자료 추가하기

| 하고 싶은 것 | 방법 |
|---|---|
| UI 용어 추가·수정 | html의 `add(...)`와 `HOW`를 고친 뒤 `npm run ingest` |
| 새 문서 추가 | 아무 폴더(결제, 로그인, 인프라 …)에 `.md` 파일을 넣고 `npm run ingest`. `## 제목` 단위로 나뉘어 검색돼요 |
| 문서 삭제 | 파일을 지우고 `npm run ingest` (검색에서도 지워져요) |
| 새 종류의 자료(PDF 등) | `extractors/`에 추출기를 만들고 `sources.config.mjs`에 등록 |

추출기는 `{ id, source, title, text, url, tags }` 모양의 배열만 돌려주면 돼요. `url`은 `개발 체크리스트` 폴더 기준 경로예요.

## 테스트

- `npm test` — 네트워크·비용 없이 다 돌아요. 추출기·그래프·조각 단위 테스트와, 가짜 AI·메모리 D1로 Worker 전체를 돌리는 스모크 테스트(ingest → 검색·캐시 → 그래프 → MCP → 주소별 라우팅)예요. CI가 배포 전에 실행해요.
- `node test/harness.mjs` — 같은 가짜 Worker를 :8812에 띄워 두고 손으로 눌러 봐요. 자료 넣기는 `AI_SEARCH_URL=http://localhost:8812 ADMIN_TOKEN=secret-token npm run ingest`.

## 설정

- 허용할 페이지 출처: `cloudflare.config.ts`의 `ALLOWED_ORIGINS` (기본값 `https://ui.leo0409.work`). 다른 주소에서도 검색을 쓰려면 쉼표로 추가해요.
- 요청 제한: IP당 1분에 10회 (`RATE_LIMITER`)
- 외부 자료(회사 팔레트·모션·Tween)는 푸시할 때와 매주 월요일 아침 배포 때 새로 받아요. 의존성 업데이트 PR은 Dependabot이 매주 보내요.
- 임베딩 모델을 바꾸면 Vectorize 인덱스를 새 차원으로 다시 만들고 `npm run ingest -- --full`을 실행해요.
- 로그: Workers Logs가 켜져 있어요(`observability`). 대시보드 Workers → dev-reference-ai-search → Logs에서 요청·오류를 봐요. 실시간은 `npx wrangler tail dev-reference-ai-search`.
- 답 생성 모델 바꾸기: `src/index.ts`의 `CLAUDE_MODEL`. 바꾸기 전에 Actions 탭의 "Compare models"를 수동 실행하면 두 모델의 답·자료·토큰·시간을 나란히 비교한 `compare.md`가 artifact로 나와요.

## 관리용 API (`Authorization: Bearer <ADMIN_TOKEN>` 필요)

- `GET /stats` — 출처별 문서 수, 관계 수(data/ai), 캐시된 답 수, 임베딩 모델, 마지막 색인 시각
- `POST /ingest/plan`, `/ingest/upsert`, `/ingest/delete` — 문서 색인. `npm run ingest`가 사용
- `POST /ingest/edges`, `/ingest/extract-plan`, `/ingest/extract` — 관계 그래프(데이터에서 뽑은 것, Claude가 글에서 뽑은 것)

사이트 전용(인증 없음, Access 뒤): `GET /graph` — 관계 전체(5분 캐시), 모달의 '관련' 칸이 써요.

## 다른 프로젝트에서 쓰기 (MCP)

`https://ui.leo0409.work/mcp`는 MCP 서버예요(`src/mcp.ts`). 다른 폴더의 Claude Code가 용어·회사 디자인 시스템·Tween 코드·영상 프롬프트·관계를 바로 가져다 써요. 자료는 D1과 `public/`에 이미 있는 것을 읽으니 따로 동기화할 게 없어요.

| 도구 | 하는 일 | 비용 |
|---|---|---|
| `company` | 회사 이름으로 팔레트·둥글기·글꼴 + CSS 변수 블록 (`q` 비면 회사 목록) | 0 |
| `list` | 출처(`ui-glossary`/`tween`/`motion`/`docs`)별 제목·id, `q`로 제목 걸러보기 | 0 |
| `get` | id 하나의 전문 — 용어 설명, 코드는 React 소스 전부, 영상은 프롬프트 + 관계 | 0 |
| `graph` | 관계 따라가기 (`hops` 1–2) | 0 |
| `search` | 자연어 질문 → AI 답 + 관련 id (사이트의 "✦ AI에게 묻기"와 같음) | Claude 호출 |

사이트가 Cloudflare Access 뒤에 있어서 **서비스 토큰**으로 들어가요 (한 번만):
1. Zero Trust → Access → Service Auth → 서비스 토큰 만들기 (예: `claude-mcp`). Client ID·Secret을 복사해요.
2. Access 앱 `ui.leo0409.work`의 정책에 **Service Auth** 정책을 추가하고 Include에 그 토큰을 넣어요.
3. 내 계정 전체에 등록 (값은 `~/.claude.json`에만 저장돼요):
   ```bash
   claude mcp add --transport http -s user ui-ref https://ui.leo0409.work/mcp \
     --header "CF-Access-Client-Id: <ID>" --header "CF-Access-Client-Secret: <SECRET>"
   ```
   `claude mcp list`에 `ui-ref … ✔ Connected`가 나오면 끝이에요.

로컬에서 확인하려면 하네스를 띄우고 `claude mcp add --transport http -s local ui-ref-test http://localhost:8812/mcp`로 붙여요 (Access 없음).
