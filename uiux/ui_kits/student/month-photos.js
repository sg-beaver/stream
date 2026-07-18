// SAINT 로그인 화면 — 캠퍼스 사진 (서강대 "캠퍼스 사진" 게시판에서 수집한 이미지 URL)
// https://www.sogang.ac.kr/ko/story/promotion-campus-photos
// 접속 시 매번 이 목록에서 무작위로 2장을 골라 로그인 화면 폴라로이드에 표시합니다.
// 월별로 다른 사진을 쓰고 싶으면 아래 CAMPUS_PHOTOS 대신 해당 월 배열에 URL을 따로 채워 넣으면 됩니다.
const CAMPUS_PHOTOS = [
  'https://www.sogang.ac.kr/dataview/board/81/20231124_1452_2410017.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20231124_1452_2410013.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20231124_1452_2410011.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/17319917751.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20200903_1113_1010001.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20200903_1112_4510001.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20200903_1116_1610001.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20211104_0942_1010001.jpg',
  'https://www.sogang.ac.kr/dataview/board/81/20230814_1602_3710021.png',
];

window.monthPhotos = {
  1: CAMPUS_PHOTOS,
  2: CAMPUS_PHOTOS,
  3: CAMPUS_PHOTOS,
  4: CAMPUS_PHOTOS,
  5: CAMPUS_PHOTOS,
  6: CAMPUS_PHOTOS,
  7: CAMPUS_PHOTOS,
  8: CAMPUS_PHOTOS,
  9: CAMPUS_PHOTOS,
  10: CAMPUS_PHOTOS,
  11: CAMPUS_PHOTOS,
  12: CAMPUS_PHOTOS,
};
