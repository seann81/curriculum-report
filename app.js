/* =============================================================================
 * 파일: app.js  (프론트엔드 공통 유틸 + index.html 목록/관리자 화면 로직)
 * ========================================================================== */

/* ─────────── 공통 유틸 ─────────── */
var U = {
  el: function (id) { return document.getElementById(id); },
  qs: function (sel, root) { return (root || document).querySelector(sel); },
  qsa: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
  // XSS·서식깨짐 방지(§7-9): 출력·화면 삽입 시 항상 이스케이프
  esc: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  // 프리필 변경 감지(서버 isChanged_ 와 동일 규칙): trim + 연속공백 1칸, 줄바꿈 보존
  isChanged: function (value, snapshot) {
    if (snapshot === undefined || snapshot === null || snapshot === '') return false;
    var n = function (s) { return String(s == null ? '' : s).replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/g, ''); };
    return n(value) !== n(snapshot);
  },
  toast: function (msg, isErr) {
    var t = U.el('toast'); if (!t) { alert(msg); return; }
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    setTimeout(function () { t.className = 'toast'; }, 3000);
  },
  statusBadge: function (s) {
    var map = { '준비중': 'b-ready', '작성중': 'b-writing', '제출완료': 'b-submitted', '잠금': 'b-locked' };
    return '<span class="badge ' + (map[s] || '') + '">' + U.esc(s) + '</span>';
  },
  param: function (name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
};

/* ─────────── index 페이지 컨트롤러 ─────────── */
var IndexPage = (function () {
  var me = null;

  function init() {
    Auth.init(function () { loadMe(); });
  }

  function loadMe() {
    API.call('me', {}).then(function (d) {
      me = d.me;
      U.el('who').textContent = me.name + ' (' + me.email + ' · ' + roleLabel(me.role) + ')';
      U.el('app').style.display = 'block';
      U.el('loginBox').style.display = 'none';
      if (me.role === 'admin') {
        U.el('adminPanel').style.display = 'block';
        U.el('bulkBar').style.display = 'flex';
        U.el('chkHead').style.display = '';
        // 연도개시용 학과 체크박스 선로딩([계정 관리]를 열지 않아도 바로 사용). _acctData 캐시도 채움.
        API.call('listUsers', {}).then(function (u) { _acctData = u; renderDeptChecks(u.depts); }).catch(function () {});
      }
      loadReports();
    }).catch(function (e) {
      // ACCESS 미등록 등
      U.el('loginBox').innerHTML = '<div class="notice">' + U.esc(e.message || '접근 권한이 없습니다.') +
        '</div><div id="gsiButton"></div>';
    });
  }

  function roleLabel(r) { return { admin: '관리자', professor: '교수자', assistant: '조교' }[r] || r; }

  function loadReports() {
    API.call('listReports', {}).then(function (d) {
      var isAdmin = me.role === 'admin';
      var rows = d.reports.map(function (r) {
        return '<tr>' +
          (isAdmin ? '<td><input type="checkbox" class="rchk" value="' + U.esc(r.reportId) +
                     '" data-status="' + U.esc(r.status) + '"></td>' : '') +
          '<td>' + r.year + '</td>' +
          '<td>' + U.esc(r.deptName) + '</td>' +
          '<td>' + U.statusBadge(r.status) + '</td>' +
          '<td>' + U.esc((r.updatedAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td>' + U.esc((r.submittedAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td><a class="btn sm" href="edit.html?report=' + encodeURIComponent(r.reportId) + '">열기</a>' +
          (isAdmin ? adminRowBtns(r) : '') +
          '</td></tr>';
      }).join('');
      var span = isAdmin ? 7 : 6;
      U.el('reportBody').innerHTML = rows || '<tr><td colspan="' + span + '" class="muted">보고서가 없습니다. 관리자가 연도를 개시하세요.</td></tr>';
      if (isAdmin && U.el('chkAll')) U.el('chkAll').checked = false; // 목록 갱신 시 전체선택 해제
    });
  }

  function adminRowBtns(r) {
    var b = '';
    if (r.status === '준비중') b += ' <button class="btn sm" onclick="IndexPage.prefill(\'' + r.reportId + '\')">프리필</button>' +
                                    ' <button class="btn sm" onclick="IndexPage.send(\'' + r.reportId + '\')">발송</button>';
    if (r.status === '제출완료') b += ' <button class="btn sm" onclick="IndexPage.close(\'' + r.reportId + '\')">마감</button>';
    return b;
  }

  /* 관리자 액션 */
  function openYear() {
    var year = Number(U.el('openYear').value);
    var codes = U.qsa('#deptChecks input:checked').map(function (c) { return c.value; });
    if (!year || !codes.length) return U.toast('연도와 학과를 선택하세요', true);
    API.call('openYear', { payload: { year: year, deptCodes: codes } }).then(function (d) {
      U.toast((d.created || []).length + '개 보고서 생성'); loadReports();
    }).catch(err);
  }
  function prefill(reportId) {
    if (!confirm('전년도 데이터를 프리필합니다. 학과가 이미 수정한 섹션은 건너뜁니다. 진행할까요?')) return;
    API.call('prefillFromPrevYear', { reportId: reportId }).then(function (d) {
      U.toast('프리필 완료: ' + (d.filled || []).join(',') + (d.note ? ' / ' + d.note : ''));
      loadReports();
    }).catch(err);
  }
  function send(reportId) {
    API.call('saveSection', { reportId: reportId, section: 'meta', payload: { status: '작성중' } })
      .then(function () { U.toast('발송(작성중 전환) 완료'); loadReports(); }).catch(err);
  }
  function close(reportId) {
    if (!confirm('마감하면 학과는 열람·다운로드만 가능합니다. 진행할까요?')) return;
    API.call('closeReport', { reportId: reportId }).then(function () { U.toast('마감(잠금) 완료'); loadReports(); }).catch(err);
  }

  /* ─────────── 일괄 처리 (개별 버튼·함수는 그대로 두고 추가) ─────────── */
  function toggleAll(cb) {
    U.qsa('#reportBody input.rchk').forEach(function (c) { c.checked = cb.checked; });
  }
  function getChecked() {
    return U.qsa('#reportBody input.rchk:checked').map(function (c) {
      return { reportId: c.value, status: c.getAttribute('data-status') };
    });
  }
  // 순차 실행: 체크된 항목을 하나씩 처리(부분 실패해도 계속), 끝나면 목록 1회 새로고침
  var bulkRunning = false; // 중복 클릭에 의한 동시 실행(레이스) 차단
  function setBulkDisabled(on) {
    U.qsa('#bulkBar button').forEach(function (b) { b.disabled = on; });
  }
  function runBulk(label, items, fn) {
    if (bulkRunning) { U.toast('이미 일괄 작업이 진행 중입니다', true); return; }
    bulkRunning = true; setBulkDisabled(true);
    var total = items.length, done = 0, failed = [];
    U.toast(label + ' 시작: ' + total + '건');
    var chain = Promise.resolve();
    items.forEach(function (it) {
      chain = chain.then(function () {
        return fn(it).then(function () { done++; })
          .catch(function (e) { failed.push(it.reportId + '(' + ((e && e.message) || '오류') + ')'); });
      });
    });
    chain.then(function () {
      bulkRunning = false; setBulkDisabled(false);
      U.toast(label + ' 완료: 성공 ' + done + '/' + total + (failed.length ? ' · 실패 ' + failed.length + '건: ' + failed.join(', ') : ''), failed.length > 0);
      loadReports();
    });
  }
  // 선택 항목을 상태조건으로 걸러 확인창 후 일괄 실행하는 공통 틀
  function bulkAction(label, okStatus, actionVerb, fn) {
    var sel = getChecked();
    if (!sel.length) return U.toast('학과를 선택하세요', true);
    var eligible = sel.filter(function (x) { return x.status === okStatus; });
    var skipped = sel.length - eligible.length;
    if (!eligible.length) return U.toast(actionVerb + ' 가능한(' + okStatus + ') 선택 항목이 없습니다', true);
    var msg = '선택 ' + sel.length + '건 중 ' + okStatus + ' ' + eligible.length + '건을 일괄 ' + actionVerb + '합니다.' +
      (skipped ? ' (' + skipped + '건은 상태 불일치로 제외)' : '') + '\n진행할까요?';
    if (!confirm(msg)) return;
    runBulk('일괄 ' + actionVerb, eligible, fn);
  }
  function bulkPrefill() {
    bulkAction('일괄 프리필', '준비중', '프리필', function (it) {
      return API.call('prefillFromPrevYear', { reportId: it.reportId });
    });
  }
  function bulkSend() {
    bulkAction('일괄 발송', '준비중', '발송', function (it) {
      return API.call('saveSection', { reportId: it.reportId, section: 'meta', payload: { status: '작성중' } });
    });
  }
  function bulkClose() {
    bulkAction('일괄 마감', '제출완료', '마감', function (it) {
      return API.call('closeReport', { reportId: it.reportId });
    });
  }

  /* 계정관리 화면 열기 */
  var _acctData = null;                                  // 마지막 listUsers 결과 캐시(학과 배정 UI용)
  function openAccounts() {
    API.call('listUsers', {}).then(function (d) {
      _acctData = d;
      renderDeptChecks(d.depts);
      var rows = d.users.map(function (u) {
        var codes = (u.deptCodes && u.deptCodes.length) ? u.deptCodes.join(', ') : (u.deptCode || '');
        var isAdmin = String(u.role).toLowerCase() === 'admin';
        var btn = isAdmin ? '<span class="muted" style="font-size:12px">전 학과</span>'
                          : '<button class="btn sm ghost" onclick="IndexPage.assignDepts(\'' + U.esc(u.email) + '\')">학과 배정</button>';
        return '<tr><td>' + U.esc(u.email) + '</td><td>' + U.esc(u.name) + '</td><td>' + U.esc(u.role) +
          '</td><td>' + U.esc(codes) + '</td><td>' + U.esc(u.submitYn) + '</td><td>' + U.esc(u.useYn) + '</td><td>' + btn + '</td></tr>';
      }).join('');
      U.el('userBody').innerHTML = rows;
      U.el('accountModal').style.display = 'flex';
    });
  }
  /* 사용자별 학과 배정(체크박스 다중선택 → setUserDepts). 저장 즉시 반영(양방향). */
  function assignDepts(email) {
    var d = _acctData; if (!d) return;
    var em = String(email).toLowerCase();
    var user = (d.users || []).filter(function (u) { return String(u.email).toLowerCase() === em; })[0];
    var current = (user && user.deptCodes) || [];
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#1c2430;max-width:680px;width:92%;max-height:82vh;overflow:auto;border-radius:12px;padding:18px 20px;box-shadow:0 6px 30px rgba(0,0,0,.3)';
    var head = document.createElement('div');
    head.innerHTML = '<b style="font-size:16px">학과 배정</b> — ' + U.esc(email) +
      '<div class="muted" style="font-size:12px;margin-top:3px">담당 학과를 체크한 뒤 저장하세요. 저장하면 즉시 반영되고, 구글시트(ACCESS_DEPT)에도 그대로 기록됩니다.</div>';
    box.appendChild(head);
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px;margin:14px 0';
    (d.depts || []).forEach(function (dep) {
      var lb = document.createElement('label'); lb.className = 'chk';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = dep.deptCode;
      if (current.indexOf(dep.deptCode) > -1) cb.checked = true;
      lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + dep.deptName + ' (' + dep.deptCode + ')'));
      grid.appendChild(lb);
    });
    box.appendChild(grid);
    var bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    var cancel = document.createElement('button'); cancel.className = 'btn ghost'; cancel.textContent = '취소';
    cancel.addEventListener('click', function () { document.body.removeChild(ov); });
    var save = document.createElement('button'); save.className = 'btn'; save.textContent = '저장';
    save.addEventListener('click', function () {
      var codes = [].slice.call(grid.querySelectorAll('input:checked')).map(function (c) { return c.value; });
      save.disabled = true;
      API.call('setUserDepts', { payload: { email: em, deptCodes: codes } }).then(function () {
        U.toast('학과 배정 저장됨'); document.body.removeChild(ov); openAccounts();
      }).catch(function (e) { save.disabled = false; err(e); });
    });
    bar.appendChild(cancel); bar.appendChild(save); box.appendChild(bar);
    ov.appendChild(box); document.body.appendChild(ov);
  }
  function renderDeptChecks(depts) {
    var host = U.el('deptChecks'); if (!host) return;
    host.innerHTML = (depts || []).map(function (d) {
      return '<label class="chk"><input type="checkbox" value="' + U.esc(d.deptCode) + '"> ' + U.esc(d.deptName) + '</label>';
    }).join('');
  }
  function saveUser() {
    var role = U.el('u_role').value;
    var p = {
      email: U.el('u_email').value.trim().toLowerCase(),
      name: U.el('u_name').value.trim(),
      role: role,
      submitYn: U.el('u_submit').value,
      useYn: U.el('u_use').value
    };
    // 학과는 [학과 배정]으로 지정. 관리자만 전 학과(*) 자동. 그 외는 deptCode 미전송 → 기존값 보존(신규는 백엔드에서 '' 기본).
    if (role === 'admin') p.deptCode = '*';
    API.call('upsertUser', { payload: p }).then(function () { U.toast('저장됨'); openAccounts(); }).catch(err);
  }

  function err(e) { U.toast((e && e.message) || '오류', true); }

  return { init: init, openYear: openYear, prefill: prefill, send: send, close: close,
           toggleAll: toggleAll, bulkPrefill: bulkPrefill, bulkSend: bulkSend, bulkClose: bulkClose,
           openAccounts: openAccounts, saveUser: saveUser, assignDepts: assignDepts };
})();

document.addEventListener('DOMContentLoaded', function () {
  if (document.body.getAttribute('data-page') === 'index') IndexPage.init();
});
