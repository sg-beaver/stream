// STREAM 공유 저장소 — 관리자가 승인한 대타를 학생 근무 시간표에도 반영하기 위한
// 브라우저 localStorage 기반 공유 저장소. shared-posts-store.js와 동일한 패턴.
// 레코드 형태: { id, requester, dept, date('YYYY.MM.DD'), time('HH:MM-HH:MM'), candidateName, reason, approver }
(function () {
  var KEY = 'stream_shared_substitutions_v1';

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

  // 저장소가 비어 있으면 초기 데이터로 채우고, 이미 있으면 기존 값을 그대로 반환
  function seed(initial) {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) { try { return JSON.parse(raw); } catch (e) { /* 무시하고 재시드 */ } }
    save(initial);
    return initial;
  }

  // 관리자가 대타를 승인할 때 호출 — 같은 id가 있으면 갱신
  function approve(record) {
    var list = getAll().filter(function (r) { return r.id !== record.id; });
    list.push(record);
    save(list);
    return list;
  }

  // 다른 탭/창에서 저장소가 바뀔 때마다 callback(all) 호출. 구독 해제 함수를 반환.
  function subscribe(callback) {
    function handler(e) {
      if (e.key !== KEY) return;
      callback(getAll());
    }
    window.addEventListener('storage', handler);
    return function unsubscribe() { window.removeEventListener('storage', handler); };
  }

  window.SharedSubstitutionsStore = { getAll: getAll, seed: seed, approve: approve, subscribe: subscribe, KEY: KEY };
})();
