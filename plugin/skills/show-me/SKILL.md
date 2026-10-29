---
name: show-me
description: 말로 설명하는 대신 A/B 시안을 같은 화면에 나란히 그려 보여주고 고르게 해요. 한 라운드에 한 축만 바꿔요(색 팔레트, 둥글기, 밀도, 글꼴, 레이아웃, 문구 톤 중 하나). 사용자가 "show me", "보여줘", "비교해서 보여줘", "A/B로", "둘 다 그려 봐", "/show-me"라고 하거나, designer 스킬이 후보 비교 단계로 부를 때 써요. 기본은 채팅 안 위젯(선택 버튼 포함), 위젯 도구가 없으면 브라우저 패널의 HTML, "공유하자"면 Design 아티팩트.
---

# Show me

보여주는 것은 고르게 하기 위해서예요. 두 안이 **한 가지만** 달라야 무엇 때문에 좋았는지 알 수 있어요.

## 순서

1. **축을 하나 정해요.** 비교할 변수 하나(예: 참고 회사 팔레트). 나머지는 모두 같게.
2. **샘플 화면 한 장을 골라요.** 브리프의 화면 유형에 가장 가까운 것 하나: `dashboard`(카드·숫자·칩), `list`(목록·필터·칩), `form`(입력·버튼·오류). 없으면 `list`.
3. **같은 화면을 두 칸에 넣고 변수만 바꿔요.** 아래 "화면" 조각 하나를 A 칸과 B 칸에 똑같이 넣고, 칸마다 변수 블록만 달리해요. 화면을 새로 그리지 않아요.
4. **보여주고 하나만 물어요.** "A와 B 중 어느 쪽이에요?" 이유는 묻지 않아요. 고르면 그 값을 확정하고, 다음 축이 있으면 1로 돌아가요. 최대 3라운드.
5. **기록해요.** 라운드마다 "축 → 고른 값" 한 줄.

## 어디에 (순서대로 첫 번째 가능한 것)

1. **채팅 안 위젯** `mcp__visualize__show_widget`이 있으면 이걸로. 먼저 `mcp__visualize__read_me`(modules: ["mockup"])를 조용히 부른 뒤, 아래 위젯 틀을 써요. 선택 버튼이 `sendPrompt`로 답을 바로 대화에 넣어서 따로 물을 필요가 없어요. 폭이 680px이라 두 칸까지만. 세 칸이 필요하면 2번으로.
2. **브라우저 패널 HTML** 위젯 도구가 없거나(터미널 CLI) 세 칸 이상일 때. `scratchpad/show-me.html`로 쓰고 브라우저 패널에 열어요. 스크린샷은 찍지 않아요. 사용자가 보고 말로 골라요.
3. **Design 아티팩트** 사용자가 "공유하자", "기록으로 남기자"라고 할 때만. 아트보드 두 개(A, B)에 같은 화면을 넣고 변수만 달리해요.

## 변수 이름

ui-ref `company`와 사이트 DESIGN.md 내보내기와 같아요: `--primary --onPrimary --primarySoft --surface --surface2 --text --muted --border --danger --r-sm --r-md --r-lg --r-btn --sp-* --font-sans`. 위젯 틀 안에서는 호스트 변수와 겹치지 않게 짧은 이름(`--p --op --ps --s --bd --t --m --rl --rm --rb`)으로 칸(`.pane`)에 인라인으로 넣어요.

## 화면 조각 (두 칸에 똑같이)

```html
<div class="card"><div style="font-size:12px;color:var(--m)">이번 달 결제</div><div style="font-size:24px;font-weight:500">₩1,240,000</div><div style="margin-top:8px"><span class="chip">+12%</span><span class="chip">정상</span></div></div>
<div class="card"><div class="in">이메일</div><div style="color:var(--dg);font-size:12px;margin-top:6px">이메일 형식이 맞지 않아요</div></div>
<div class="card" style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:14px">알림 받기</span><span class="btn">저장</span></div>
```

`dashboard`면 숫자 카드 두 개를 더, `list`면 칩 줄과 항목 3개, `form`이면 입력 2개와 오류 1개로 바꿔요. 조각은 10줄 안쪽.

## 위젯 틀 (기본)

```html
<h2 class="sr-only">A와 B 팔레트를 같은 화면에 입힌 시안과 선택 버튼</h2>
<style>
.ab{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:.5rem 0}
.pane{border:0.5px solid var(--border);border-radius:12px;padding:16px}
.pane h3{margin:0 0 12px;font-size:13px;font-weight:500;color:var(--text-secondary)}
.card{background:var(--s);border:1px solid var(--bd);border-radius:var(--rl);padding:14px;margin-bottom:12px;color:var(--t);font-family:var(--font-sans)}
.chip{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--ps);color:var(--p);font-size:12px;margin-right:6px}
.btn{display:inline-block;padding:8px 14px;border-radius:var(--rb);background:var(--p);color:var(--op);font-size:13px;font-weight:500}
.in{border:1px solid var(--bd);border-radius:var(--rm);padding:8px;color:var(--m);font-size:13px}
.pick{display:flex;gap:8px;justify-content:center;padding:4px 0 .5rem}
</style>
<div class="ab">
  <div class="pane" style="--p:#3182f6;--op:#fff;--ps:#e8f3ff;--s:#fff;--bd:#e5e8eb;--t:#191f28;--m:#8b95a1;--dg:#e42939;--rl:12px;--rm:6px;--rb:16px"><h3>A · 토스</h3>화면 조각</div>
  <div class="pane" style="--p:#ffe300;--op:#111;--ps:#fff9c4;--s:#fff;--bd:#e0e0e0;--t:#1a1a1a;--m:#6d6d6d;--dg:#d32f2f;--rl:12px;--rm:6px;--rb:16px"><h3>B · 카카오뱅크</h3>화면 조각</div>
</div>
<div class="pick">
  <button onclick="sendPrompt('A(토스)로 할게요')">A 선택 ↗</button>
  <button onclick="sendPrompt('B(카카오뱅크)로 할게요')">B 선택 ↗</button>
  <button onclick="sendPrompt('둘 다 아니에요, 다른 후보 보여줘')">다른 후보 ↗</button>
</div>
```

위젯 규칙: 바깥 배경 없음, 그림자·그라데이션 없음, 글꼴 굵기는 400·500만, 설명 글은 위젯 밖 답변에. 버튼 문구에는 고른 회사 이름을 넣어 대화 기록만 봐도 무엇을 골랐는지 알게 해요.

## 브라우저 패널 틀 (대안)

```html
<!doctype html><meta charset="utf-8"><title>A / B</title>
<style>
  :root{ --p:#3182f6;--op:#fff;--ps:#e8f3ff;--s:#fff;--s2:#f2f4f6;--bd:#e5e8eb;--t:#191f28;--m:#8b95a1;--dg:#e42939;--rl:12px;--rm:6px;--rb:16px;--font-sans:"Pretendard",system-ui,sans-serif }
  .b{ --p:#ffe300;--op:#111;--ps:#fff9c4;--t:#1a1a1a;--m:#6d6d6d;--bd:#e0e0e0;--dg:#d32f2f }
  body{margin:0;display:grid;grid-template-columns:1fr 1fr;min-height:100vh;font:14px/1.5 var(--font-sans);background:var(--s2);color:var(--t)}
  section{padding:24px} h1{margin:0 0 16px;font-size:13px;color:var(--m)}
  .card{background:var(--s);border:1px solid var(--bd);border-radius:var(--rl);padding:14px;margin-bottom:12px}
  .btn{display:inline-block;padding:10px 16px;border-radius:var(--rb);background:var(--p);color:var(--op);font-weight:600}
  .chip{display:inline-block;padding:4px 10px;border-radius:999px;background:var(--ps);color:var(--p);margin-right:6px}
  .in{border:1px solid var(--bd);border-radius:var(--rm);padding:10px;background:var(--s);color:var(--m)}
</style>
<body>
<section><h1>A · 토스</h1><!--SCREEN--></section>
<section class="b"><h1>B · 카카오뱅크</h1><!--SCREEN--></section>
<script>
  const SCREEN = `화면 조각`;
  document.querySelectorAll('section').forEach(s => s.insertAdjacentHTML('beforeend', SCREEN));
</script>
```

세 칸이면 `grid-template-columns:repeat(3,1fr)`와 `section.c`를 더해요.

## 규칙

- A와 B는 한 축만 달라요. 두 축을 바꾸고 싶으면 두 라운드. "팔레트" 축은 색 변수 전체(강조·연한 강조·글자·보조·테두리·상태 색)를 한 묶음으로 바꿔요. 강조색만 바꾸면 칩과 연한 강조색이 어긋나요.
- 값의 출처(어느 회사인지)를 칸 제목에 적어요. "A · 토스", "B · 카카오뱅크".
- 색 라운드에서 글꼴을 같이 바꾸지 않아요. 글꼴 라운드는 `--font-sans`(브라우저 패널에서는 `<link>`도)만. 위젯에서는 웹 글꼴을 못 불러올 수 있으니 글꼴 라운드는 브라우저 패널로.
- 넷 이상 후보는 먼저 둘로 줄여요. 셋이면 브라우저 패널.
- 고른 뒤 "왜"를 묻지 않아요. 필요하면 사용자가 말해요.
