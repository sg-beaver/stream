// 관리자 화면 상태 배지 색상 — StatusPill의 slug 톤에 관리자 쪽 한글 상태값을 매핑
const TONE_BY_STATUS = {
  '모집중': 'open', '모집완료': 'full', '마감임박': 'closing', '마감': 'closed', '임시저장': 'closed',
  '검토중': 'screening', '선발': 'selected', '보류': 'waitlist', '탈락': 'rejected',
  '승인': 'selected', '반려': 'rejected', '미처리': 'closing', '정상': 'selected',
}

export function adminStatusSlug(status) {
  return TONE_BY_STATUS[status] || 'closed'
}
