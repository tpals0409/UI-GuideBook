-- 자료 사이의 관계(그래프). src·dst는 docs.id예요. 검색 때 찾은 자료의 이웃을 한 단계 더 가져오는 데 써요.
-- rel: compare(비교 대상), mentions(설명에서 언급), code(용어의 코드 버전), uses(컴포넌트가 다른 컴포넌트를 씀)
-- Worker도 CREATE TABLE IF NOT EXISTS로 같은 표를 만들어서, 배포만으로도 동작해요.
CREATE TABLE IF NOT EXISTS edges (
  src TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (src, rel, dst)
);
CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst);
