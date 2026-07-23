// STREAM 공유 저장소 — 학생이 실제로 제출한 지원서를 관리자 콘솔의 "학생 선발" 지원자 목록에 반영하기 위한
// 브라우저 localStorage 기반 공유 저장소. shared-posts-store.js와 동일한 패턴.
(function () {
  var KEY = 'stream_shared_applicants_v1';

  function getAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) { /* localStorage 사용 불가 환경 — 저장 스킵 */ }
  }

  // 지원서 제출 시 호출 — 목록 맨 앞에 추가하고 저장
  function add(applicant) {
    var list = getAll();
    list = [applicant, ...list];
    save(list);
    return list;
  }

  // 다른 탭/창에서 저장소가 바뀔 때마다 callback(list) 호출. 구독 해제 함수를 반환.
  function subscribe(callback) {
    function handler(e) {
      if (e.key !== KEY || !e.newValue) return;
      try { callback(JSON.parse(e.newValue)); } catch (err) { /* 무시 */ }
    }
    window.addEventListener('storage', handler);
    return function unsubscribe() { window.removeEventListener('storage', handler); };
  }

  window.SharedApplicantsStore = { getAll: getAll, save: save, add: add, subscribe: subscribe, KEY: KEY };
})();
