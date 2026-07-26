// STREAM 공유 저장소 — 근로 시간표 화면에서 확정한 근무표를 학생 관리 등 다른 화면에도 그대로
// 반영하기 위한 브라우저 localStorage 기반 공유 저장소. 공고(postId)별로 가장 최근 확정 근무표
// 1건을 저장한다. shared-posts-store.js와 동일한 패턴.
(function () {
  var KEY = 'stream_shared_schedules_v1';

  function getAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function getForPost(postId) {
    var all = getAll();
    return all[postId] || null;
  }

  // 근무표 확정 시 호출 — 해당 공고의 확정 근무표를 덮어쓴다
  function confirm(postId, schedule) {
    var all = getAll();
    all[postId] = schedule;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* localStorage 사용 불가 환경 — 저장 스킵 */ }
    return all;
  }

  // 다른 탭/창에서 저장소가 바뀔 때마다 callback(all) 호출. 구독 해제 함수를 반환.
  function subscribe(callback) {
    function handler(e) {
      if (e.key !== KEY || !e.newValue) return;
      try { callback(JSON.parse(e.newValue)); } catch (err) { /* 무시 */ }
    }
    window.addEventListener('storage', handler);
    return function unsubscribe() { window.removeEventListener('storage', handler); };
  }

  window.SharedSchedulesStore = { getAll: getAll, getForPost: getForPost, confirm: confirm, subscribe: subscribe, KEY: KEY };
})();
