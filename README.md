# UI GuideBook

개발하면서 참고할 자료를 모아 둔 저장소예요. UI 용어 사전과 분야별 체크리스트, 이 자료를 질문으로 찾는 AI 검색이 들어 있어요.

**사이트: https://ui.leo0409.work** (Cloudflare Access로 잠겨 있어요. 허용된 Google 계정으로만 열려요)

## 들어 있는 것

| 폴더 | 내용 |
|---|---|
| [`UI/`](UI) | **UI 용어 사전** `ui-glossary.html` — 공식 명칭 기준 126개 용어. 카드마다 실제로 동작하는 예시, 비슷한 용어와의 차이, 상세 모달(동작 방식)이 있어요. 파일 하나라 브라우저로 바로 열려요. |
| [`로그인/`](로그인) | 로그인 보안 구현·검증 체크리스트 |
| `결제/`, `인프라/` | 앞으로 추가할 체크리스트 |
| [`ai-search/`](ai-search) | AI 검색 Cloudflare Worker — 사이트 호스팅, 자료 색인, 질문 답변 |

## UI 용어 사전

- 분류: 액션·입력, 오버레이·피드백, 내비게이션, 콘텐츠 표시, 레이아웃, 효과, 디자인 개념
- 용어 이름은 WAI-ARIA APG → HTML·CSS 표준(MDN) → Material Design 3 → Apple HIG 순서로 따르고, 공식 문서에 없는 이름은 "관용어"로 표시해요.
- 검색은 한글·영문·별칭을 모두 찾고, 띄어쓰기와 하이픈은 무시해요. 키보드 `/`로 검색창에 바로 갈 수 있어요.
- 라이트/다크 모드, 휴대폰 화면을 지원해요.

## AI 검색

사이트에서 검색창에 질문을 쓰고 Enter를 누르면, 이 저장소의 자료 안에서 답을 찾아 짧게 설명하고 근거 항목을 보여줘요.

```
질문 → 임베딩(Workers AI bge-m3) → Vectorize 검색 (+ 관계 그래프 이웃) → 재정렬 → Claude Opus 5.5 → 답변 + 근거 항목
```

- 대상 자료: UI 용어 사전 + 모든 폴더의 `.md` 문서(`## 제목` 단위) + 갤러리의 애니메이션 코드·모션 영상 프롬프트
- Claude는 검색으로 찾은 항목 안에서만 고르도록 제한돼 있어서 없는 항목을 지어내지 않아요.
- 로컬 파일로 연 html에서는 AI 버튼이 숨겨지고, 나머지 기능은 그대로 동작해요.

설치·배포·자료 올리기 방법은 [`ai-search/README.md`](ai-search/README.md)에 있어요.

## 자료 추가하기

| 하고 싶은 것 | 방법 |
|---|---|
| UI 용어 추가·수정 | `UI/ui-glossary.html`의 `add(...)`, `HOW` 데이터를 고쳐요 |
| 체크리스트·문서 추가 | 알맞은 폴더에 `.md` 파일을 넣어요 |
| 사이트·AI 검색에 반영 | `main`에 푸시하면 GitHub Actions가 자동으로 배포하고 검색 색인을 갱신해요 (바뀐 문서만) |

자동 배포는 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)에 있어요. PR에서는 빌드와 배포 점검만 하고, Actions 탭에서 수동으로 실행할 수도 있어요. 필요한 GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_TOKEN`.

## 비밀값

API 키와 관리용 토큰은 Cloudflare Worker의 secret에만 저장돼 있고, 이 저장소에는 없어요. `.env*` 파일은 `.gitignore`로 제외돼요.
