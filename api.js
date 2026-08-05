/* =============================================================================
 * 파일: api.js  (프론트엔드 공통 — index/edit/preview 모두 로드)
 * 역할: 환경설정 상수 · 인증 추상화(GIS/HtmlService) · API 통신(CORS 우회) ·
 *       로컬 자동백업 · 목업(USE_MOCK) 데이터
 *
 * ※ 교무팀이 값만 바꾸는 구역은 아래 [설정] 한 곳뿐이다.
 * ========================================================================== */

/* ─────────────────────────── [설정] ─────────────────────────── */
var CONFIG = {
  // true 로 두면 백엔드 없이 목업 데이터로 화면을 확인할 수 있다(코드 수정 없이 상수만 변경).
  USE_MOCK: true,

  // 인증/호스팅 모드:
  //   'GIS'         : GitHub Pages 등 정적 웹 + Google 로그인(ID 토큰) — 1순위
  //   'HTMLSERVICE' : GAS 웹앱 안에서 구동(google.script.run) — 대체안
  AUTH_MODE: 'GIS',

  // 웹앱 배포 URL(GIS 모드에서 fetch 대상). clasp 배포로 생성됨(2026-08-04, 조직계정).
  API_URL: 'https://script.google.com/macros/s/AKfycbyTi0tCUPpHtaxog0K5_NQCcOxL7rt70RallLfC5fcMlLIMEQylWVzP0r3z2kxLozoO/exec',

  // GIS 클라이언트 ID(발급 완료 2026-08-05, 프로젝트 curriculum-report / 조직 iscu.ac.kr / Internal). HTMLSERVICE 모드에서는 불필요.
  CLIENT_ID: '825565517253-a9rv5g0r5gnev6m294pucvp83hf59ja8.apps.googleusercontent.com',

  ALLOWED_DOMAIN: 'iscu.ac.kr'
};

/* ═══════════════════════════ 인증 추상화 ═══════════════════════════ */
var Auth = (function () {
  var idToken = null;      // GIS 모드에서 보관하는 ID 토큰(JWT)
  var onLoginCb = null;

  /** GIS 스크립트 로드 후 로그인 준비. onLogin(email) 콜백은 로그인 성공 시 호출. */
  function init(onLogin) {
    onLoginCb = onLogin;
    if (CONFIG.USE_MOCK) { onLogin && onLogin('admin@' + CONFIG.ALLOWED_DOMAIN); return; }
    if (CONFIG.AUTH_MODE === 'HTMLSERVICE') { onLogin && onLogin('(google.script.run 신원)'); return; }

    // GIS 모드
    loadScript('https://accounts.google.com/gsi/client', function () {
      google.accounts.id.initialize({
        client_id: CONFIG.CLIENT_ID,
        callback: handleCredential,
        hd: CONFIG.ALLOWED_DOMAIN,     // 조직 계정 힌트
        auto_select: true
      });
      var host = document.getElementById('gsiButton');
      if (host) {
        google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko' });
      }
      google.accounts.id.prompt(); // 원탭 시도
    });
  }

  function handleCredential(resp) {
    idToken = resp.credential;
    var email = parseJwt(idToken).email || '';
    onLoginCb && onLoginCb(email);
  }

  /** 조용한 재로그인(토큰 만료 시). 실패하면 reject. */
  function refresh() {
    return new Promise(function (resolve, reject) {
      if (CONFIG.USE_MOCK || CONFIG.AUTH_MODE === 'HTMLSERVICE') return resolve();
      try {
        google.accounts.id.prompt(function (n) {
          if (n.isNotDisplayed() || n.isSkippedMoment()) reject(new Error('재로그인 필요'));
        });
        // credential 콜백에서 idToken 갱신되면 이후 재시도 성공
        setTimeout(resolve, 800);
      } catch (e) { reject(e); }
    });
  }

  function getToken() { return idToken; }

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true; s.onload = cb;
    document.head.appendChild(s);
  }
  function parseJwt(t) {
    try {
      var b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return {}; }
  }

  return { init: init, refresh: refresh, getToken: getToken, parseJwt: parseJwt };
})();

/* ═══════════════════════════ API 통신 ═══════════════════════════ */
var API = (function () {

  /**
   * 서버 호출. action + 파라미터 → 성공 시 data, 실패 시 {code,message} 로 reject.
   * 토큰 만료(UNAUTHORIZED) 시: 조용한 재로그인 → 1회 재시도.
   */
  function call(action, params, _retried) {
    params = params || {};
    if (CONFIG.USE_MOCK) return Mock.handle(action, params);

    var payload = Object.assign({ action: action, idToken: Auth.getToken() }, params);

    var transport = (CONFIG.AUTH_MODE === 'HTMLSERVICE') ? viaGoogleScript : viaFetch;
    return transport(payload).then(function (res) {
      if (res.ok) return res.data;
      // 만료 → 조용한 재로그인 후 1회 재시도
      if (res.error && res.error.code === 'UNAUTHORIZED' && !_retried) {
        return Auth.refresh().then(function () {
          return call(action, params, true);
        });
      }
      return Promise.reject(res.error || { code: 'SERVER', message: '알 수 없는 오류' });
    });
  }

  // 정적 웹(GIS) : CORS 우회를 위해 text/plain 으로 POST. application/json 금지(프리플라이트).
  function viaFetch(payload) {
    return fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  // HtmlService 통합 : google.script.run 으로 서버 apiRouter 호출.
  function viaGoogleScript(payload) {
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(function (json) { resolve(JSON.parse(json)); })
        .withFailureHandler(function (err) { reject({ code: 'SERVER', message: String(err) }); })
        .apiRouter(JSON.stringify(payload));
    });
  }

  return { call: call };
})();

/* ═══════════════════════════ 로컬 자동백업(§7-2) ═══════════════════════════ */
var Backup = {
  key: function (reportId, section) { return 'edu_backup::' + reportId + '::' + section; },
  save: function (reportId, section, payload) {
    try { localStorage.setItem(this.key(reportId, section), JSON.stringify({ t: Date.now(), payload: payload })); } catch (e) {}
  },
  load: function (reportId, section) {
    try { var v = localStorage.getItem(this.key(reportId, section)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  },
  clear: function (reportId, section) { try { localStorage.removeItem(this.key(reportId, section)); } catch (e) {} }
};

/* ═══════════════════════════ 목업 데이터(USE_MOCK) ═══════════════════════════ */
var Mock = (function () {
  var UNIV = {
    ideology: '믿음으로 일하는 자유인',
    purpose: '4차산업혁명시대를 이끌어 갈 자기주도적 학습역량을 갖춘 융·복합 인재 양성',
    goals: [
      { code: 'U1', text: '자기주도적 생애학습 역량교육' },
      { code: 'U2', text: '학습자 요구에 부응하는 유연한 교육' },
      { code: 'U3', text: '미래지식산업 선도 실용적 융·복합 교육' },
      { code: 'U4', text: '4차산업혁명 시대에 부합하는 디지털리터러시 교육' },
      { code: 'U5', text: '소통·협력의 포용적 교육' },
      { code: 'U6', text: '문화역량을 포함한 감성역량을 갖춘 세계시민 교육' }
    ],
    talents: ['교양인', '창의인', '세계인'],
    competencies: [
      { code: 'C1', name: '자율책임', subs: ['자율성', '자기주도성', '자기효능감'] },
      { code: 'C2', name: '문예소양', subs: ['문화예술적통찰', '문화예술지식', '예술적감수성', '문화예술향유'] },
      { code: 'C3', name: '창의융합', subs: ['도전의식', '유연한사고', '비판적사고', '문제해결능력'] },
      { code: 'C4', name: '정보활용', subs: ['디지털리터러시', '정보탐색능력', '정보관리능력', 'ICT활용능력'] },
      { code: 'C5', name: '소통협력', subs: ['문해력', '배려', '대인관계능력', '갈등해결능력'] },
      { code: 'C6', name: '세계시민', subs: ['외국어능력', '다문화이해', '세계시민의식', '봉사정신'] }
    ]
  };
  var me = { email: 'admin@iscu.ac.kr', name: '교무팀관리자', role: 'admin', deptCode: '*', deptName: '전학과', submitYn: 'Y' };
  var reports = [
    { reportId: '2027_SW', year: 2027, deptCode: 'SW', deptName: '사회복지전공', status: '작성중', updatedAt: '2026-08-04T09:00:00+09:00', submittedAt: '' }
  ];
  // 사회복지전공 프리필 샘플(발송본 기반 축약)
  var detail = {
    '2027_SW': {
      meta: { year: 2027, deptCode: 'SW', deptName: '사회복지전공', status: '작성중', updatedAt: '2026-08-04T09:00:00+09:00', updatedBy: 'admin@iscu.ac.kr', noChange2: false, noChange3: false },
      univ: UNIV,
      sec1_1: {
        goals: ['모두를 위한 지속성장을 추구하는 전문적 사회복지사 양성', '이해와 존중, 차별과 배제 없는 사회복지사 양성', '미래세대로 이어지는 복지문화를 선도하는 사회복지사 양성', '글로벌 미래 사회에 신속하게 대응하는 능동적 전문가 양성', '윤리적 실천을 따르는 가치지향 전문가 양성', '연대와 협력, 나눔문화를 창출하는 사회복지사 양성'].map(function (v) { return { value: v, prefillSnapshot: v, isPrefilled: true, changed: false }; }),
        talents: ['진정성 있는 감성소통의 가치지향 실천가', '혁신적사고로 신사회복지 변화를 주도하는 융복합 복지 전문가', '연대와 협력으로 윤리적 공존복지를 선도하는 복지전문가'].map(function (v) { return { value: v, prefillSnapshot: v, isPrefilled: true, changed: false }; }),
        overview: '사회복지전공 교육과정은 크게 전공기초, 전공심화, 응용으로 나뉜다. …(발송본 개요 전문)',
        overviewMeta: { isPrefilled: true, changed: false, prefillSnapshot: '사회복지전공 교육과정은 크게 전공기초, 전공심화, 응용으로 나뉜다. …(발송본 개요 전문)' },
        jobCompetencies: [
          { name: '사회복지 환경 이해', definition: '사회복지를 둘러싼 변화하는 환경·정책·지역사회에 대한 인식과 대처 능력', prefillSnapshot: '사회복지를 둘러싼 변화하는 환경·정책·지역사회에 대한 인식과 대처 능력', isPrefilled: true, changed: false },
          { name: 'WEL-TEC', definition: '사회복지 업무에 필요한 신기술 습득·데이터 분석·디지털 플랫폼 활용 역량', prefillSnapshot: '사회복지 업무에 필요한 신기술 습득·데이터 분석·디지털 플랫폼 활용 역량', isPrefilled: true, changed: false }
        ]
      },
      sec1_2: { oneLine: '', talents: [], rows: [
        { no: 'G1', goal: '', uCodes: [], capability: '', cCodes: [], curriculum: { basic: '', advanced: '', applied: '' }, nonCurricular: '', evidence: '' },
        { no: 'G2', goal: '', uCodes: [], capability: '', cCodes: [], curriculum: { basic: '', advanced: '', applied: '' }, nonCurricular: '', evidence: '' },
        { no: 'G3', goal: '', uCodes: [], capability: '', cCodes: [], curriculum: { basic: '', advanced: '', applied: '' }, nonCurricular: '', evidence: '' },
        { no: 'G4', goal: '', uCodes: [], capability: '', cCodes: [], curriculum: { basic: '', advanced: '', applied: '' }, nonCurricular: '', evidence: '' }
      ], micro: { programs: [], linked: '' } },
      sec1_3: { cells: [
        { level: '기초', grade: 1, term: '1학기+하계', courses: [{ name: '사회복지학개론', owner: '주관', prefillSnapshot: '사회복지학개론', isPrefilled: true, changed: false }] },
        { level: '심화', grade: 2, term: '1학기+하계', courses: [{ name: '사회복지실천론', owner: '주관', prefillSnapshot: '사회복지실천론', isPrefilled: true, changed: false }] },
        { level: '응용', grade: 3, term: '1학기+하계', courses: [{ name: '정신건강사회복지론', owner: '주관', prefillSnapshot: '정신건강사회복지론', isPrefilled: true, changed: false }] }
      ] },
      sec2: { socialDemand: '', learnerDemand: '', reformItems: '', expectedEffect: '', refs: [] },
      sec3_1: [], sec3_2: [], sec3_3: []
    }
  };

  function handle(action, p) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(route(action, p)); }, 120);
    });
  }
  function route(action, p) {
    switch (action) {
      case 'me': return { me: me, univ: UNIV };
      case 'listReports': return { reports: reports };
      case 'listUsers': return { users: [me], depts: [{ deptCode: 'SW', deptName: '사회복지전공' }, { deptCode: 'PSY', deptName: '상담심리학과' }] };
      case 'getReport':
      case 'exportPayload': return detail[p.reportId || (p.year + '_' + p.deptCode)] || detail['2027_SW'];
      case 'saveSection': return { updatedAt: new Date().toISOString() };
      case 'submitReport': return { submitted: true, warnings: [] };
      case 'prefillFromPrevYear': return { filled: ['1-1', '1-3'], skipped: [], note: '' };
      case 'openYear': return { created: [p.payload && p.payload.year + '_SW'], skipped: 0 };
      case 'closeReport': return { status: '잠금' };
      case 'upsertUser': return { users: [me], depts: [] };
      default: return {};
    }
  }
  return { handle: handle, UNIV: UNIV };
})();

/* Object.assign 폴백(구형 브라우저) */
if (typeof Object.assign !== 'function') {
  Object.assign = function (t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; for (var k in s) if (s.hasOwnProperty(k)) t[k] = s[k]; } return t; };
}
