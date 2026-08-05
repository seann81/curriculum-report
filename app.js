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
      if (me.role === 'admin') U.el('adminPanel').style.display = 'block';
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
      var rows = d.reports.map(function (r) {
        return '<tr>' +
          '<td>' + r.year + '</td>' +
          '<td>' + U.esc(r.deptName) + '</td>' +
          '<td>' + U.statusBadge(r.status) + '</td>' +
          '<td>' + U.esc((r.updatedAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td>' + U.esc((r.submittedAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td><a class="btn sm" href="edit.html?report=' + encodeURIComponent(r.reportId) + '">열기</a>' +
          (me.role === 'admin' ? adminRowBtns(r) : '') +
          '</td></tr>';
      }).join('');
      U.el('reportBody').innerHTML = rows || '<tr><td colspan="6" class="muted">보고서가 없습니다. 관리자가 연도를 개시하세요.</td></tr>';
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

  /* 계정관리 화면 열기 */
  function openAccounts() {
    API.call('listUsers', {}).then(function (d) {
      renderDeptChecks(d.depts);
      var rows = d.users.map(function (u) {
        return '<tr><td>' + U.esc(u.email) + '</td><td>' + U.esc(u.name) + '</td><td>' + U.esc(u.role) +
          '</td><td>' + U.esc(u.deptCode) + '</td><td>' + U.esc(u.submitYn) + '</td><td>' + U.esc(u.useYn) + '</td></tr>';
      }).join('');
      U.el('userBody').innerHTML = rows;
      U.el('accountModal').style.display = 'flex';
    });
  }
  function renderDeptChecks(depts) {
    var host = U.el('deptChecks'); if (!host) return;
    host.innerHTML = (depts || []).map(function (d) {
      return '<label class="chk"><input type="checkbox" value="' + U.esc(d.deptCode) + '"> ' + U.esc(d.deptName) + '</label>';
    }).join('');
  }
  function saveUser() {
    var p = {
      email: U.el('u_email').value.trim().toLowerCase(),
      name: U.el('u_name').value.trim(),
      role: U.el('u_role').value,
      deptCode: U.el('u_dept').value.trim(),
      submitYn: U.el('u_submit').value,
      useYn: U.el('u_use').value
    };
    API.call('upsertUser', { payload: p }).then(function () { U.toast('저장됨'); openAccounts(); }).catch(err);
  }

  function err(e) { U.toast((e && e.message) || '오류', true); }

  return { init: init, openYear: openYear, prefill: prefill, send: send, close: close,
           openAccounts: openAccounts, saveUser: saveUser };
})();

document.addEventListener('DOMContentLoaded', function () {
  if (document.body.getAttribute('data-page') === 'index') IndexPage.init();
});
