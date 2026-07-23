// STREAM 공유 저장소 — 관리자 콘솔에서 등록한 공고를 학생 포털에도 실시간으로 반영하기 위한
// 브라우저 localStorage 기반 공유 저장소. 실제 백엔드가 없는 프로토타입 환경에서
// admin/index.html과 student/index.html이 같은 브라우저의 서로 다른 탭/창으로 열려 있을 때,
// 한쪽에서 저장하면 storage 이벤트로 다른 쪽 탭에 즉시 반영됩니다.
(function () {
  var KEY = 'stream_shared_posts_v1';

  function getAll() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(posts) {
    try {
      localStorage.setItem(KEY, JSON.stringify(posts));
    } catch (e) { /* localStorage 사용 불가 환경 — 저장 스킵 */ }
  }

  // 저장소가 비어 있으면 초기 데이터로 채우고, 이미 있으면 기존 값을 그대로 반환
  function seed(initial) {
    var existing = getAll();
    if (existing) return existing;
    save(initial);
    return initial;
  }

  // 다른 탭/창에서 저장소가 바뀔 때마다 callback(posts) 호출. 구독 해제 함수를 반환.
  function subscribe(callback) {
    function handler(e) {
      if (e.key !== KEY || !e.newValue) return;
      try { callback(JSON.parse(e.newValue)); } catch (err) { /* 무시 */ }
    }
    window.addEventListener('storage', handler);
    return function unsubscribe() { window.removeEventListener('storage', handler); };
  }

  window.SharedPostsStore = { getAll: getAll, save: save, seed: seed, subscribe: subscribe, KEY: KEY };
})();
