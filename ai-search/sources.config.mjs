// AI 검색에 넣을 자료 목록이에요. 경로는 이 파일 기준 상대 경로예요.
// 새 종류의 자료가 생기면 extractors/에 추출기를 만들고 여기에 한 줄 추가해요.
export default [
  // UI 용어 사전 (html 안의 add(...)와 HOW 데이터)
  { source: 'ui-glossary', extractor: 'glossary', path: '../UI/ui-glossary.html' },
  // 모든 폴더의 .md 문서 (결제, 로그인, 인프라 등에 새 문서를 넣으면 자동으로 포함돼요)
  { source: 'docs', extractor: 'markdown', path: '..', exclude: ['ai-search', 'node_modules', '.git'] },
];
