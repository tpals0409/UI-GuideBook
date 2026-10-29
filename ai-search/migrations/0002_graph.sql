-- 자료 사이의 관계(그래프). src·dst는 docs.id예요. 검색 때 찾은 자료의 이웃을 한 단계 더 가져오는 데 써요.
-- rel: compare(비교 대상), mentions(설명에서 언급), code(용어의 코드 버전), uses(컴포넌트가 다른 컴포넌트를 씀)
-- origin: data(자료에 적힌 관계) 또는 ai(글에서 Claude가 뽑은 관계). extracted는 어떤 문서를 어느 내용으로 뽑았는지 기록해요.
-- 프로덕션 D1은 이 모양을 이미 갖고 있어요(예전엔 Worker가 실행 중에 만들었어요). 새 DB는 migrations apply로 똑같이 생겨요.
CREATE TABLE IF NOT EXISTS edges (
  src TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  origin TEXT NOT NULL DEFAULT 'data',
  PRIMARY KEY (src, rel, dst)
);
CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst);
CREATE TABLE IF NOT EXISTS extracted (doc_id TEXT PRIMARY KEY, hash TEXT NOT NULL, extracted_at TEXT NOT NULL);
