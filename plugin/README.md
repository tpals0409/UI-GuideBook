# ui-guidebook 플러그인

ui-ref MCP(UI 용어 126개, 회사 디자인 시스템 514개, 애니메이션 코드 61개, 모션 프롬프트 234개)와 디자인 스킬 3개를 한 번에 설치해요.

## 설치

```bash
claude plugin marketplace add tpals0409/UI-GuideBook
claude plugin install ui-guidebook@ui-guidebook
```

MCP는 Cloudflare Access 서비스 토큰이 필요해요. Claude Code를 여는 셸에 두 환경 변수를 넣어 두면 돼요(값은 Zero Trust → Access → Service credentials에서).

```bash
export CF_ACCESS_CLIENT_ID=...
export CF_ACCESS_CLIENT_SECRET=...
```

## 들어 있는 것

| 이름 | 하는 일 |
|---|---|
| MCP `ui-ref` | `company`(회사 팔레트·둥글기·간격·타이포·글꼴·대비·CSS 변수), `list`/`get`(용어·코드·영상), `search`(자연어, AI), `graph`(관계) |
| `/designer` | 브리프 → 참고 회사 → 토큰 → 컴포넌트 → DESIGN.md + tokens.css 또는 Design System 아티팩트 → 대비 검수 |
| `/grill-me` | 결과를 가르는 질문만 최대 5개, 끝에 확정 브리프 |
| `/show-me` | 같은 화면에 A/B 시안, 한 라운드 한 축, 채팅 안 위젯 기본 |

자료 출처: oh-my-design(회사 디자인), Tween UI(코드), prompt-motion(영상). 권리는 각 작성자·회사에 있고 참고용이에요.
