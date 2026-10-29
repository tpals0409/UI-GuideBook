-- 검색 답 캐시. key = 질문(소문자·공백 정리) + 출처 필터의 SHA-256. 색인이나 관계가 바뀌면 Worker가 표를 비워요.
CREATE TABLE IF NOT EXISTS answers (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
