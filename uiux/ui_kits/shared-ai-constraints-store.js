// STREAM 공유 저장소 — 관리자가 근로 시간표를 만들 때 AI에게 자연어로 남긴 "소프트" 제약 조건.
// 시간표 생성 알고리즘 자체(ScheduleModule.jsx의 순수 함수 Layer)에는 반영되지 않고, 나중에
// 그 조건과 어긋나는 일이 생겼을 때(예: 대타 승인) 관리자에게 재확인시키는 참고용 메모다.
// shared-posts-store.js와 동일한 브라우저 localStorage 기반 패턴.
// 레코드 형태: { id, dept, weekday?('월'~'금'), session?('evening'), require?: { attr, equals }, note, source, capturedAt }
(function () {
  var KEY = 'stream_shared_ai_constraints_v1';

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

  // 관리자가 근무표 생성 화면에서 AI에게 새 조건을 남길 때 호출
  function add(record) {
    var list = getAll();
    list.push(record);
    save(list);
    return list;
  }

  // 다른 탭/창 및 같은 페이지 내 다른 화면(모듈)에서 저장소가 바뀔 때마다 callback(all) 호출.
  // storage 이벤트는 같은 탭에서는 발생하지 않으므로, add() 이후 각 화면에서 직접 getAll()로 갱신한다.
  function subscribe(callback) {
    function handler(e) {
      if (e.key !== KEY) return;
      callback(getAll());
    }
    window.addEventListener('storage', handler);
    return function unsubscribe() { window.removeEventListener('storage', handler); };
  }

  window.SharedAIConstraintsStore = { getAll: getAll, seed: seed, add: add, subscribe: subscribe, KEY: KEY };
})();
