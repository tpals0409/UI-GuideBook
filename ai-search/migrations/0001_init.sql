-- 문서 1개 = 검색 결과 1개. hash로 바뀐 문서만 다시 임베딩해요.
CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 문서를 나눈 조각. vector_id는 Vectorize의 벡터 id와 같아요.
CREATE TABLE chunks (
  vector_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX chunks_doc_id ON chunks (doc_id);

-- 색인 정보 (임베딩 모델 이름, 마지막 색인 시각)
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
