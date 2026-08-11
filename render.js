/* =============================================================================
 * 파일: render.js  (미리보기·다운로드 공용)
 * 역할: 보고서 데이터(§6-3) → 최종 출력 HTML 조립. 미리보기와 다운로드가 "같은 마크업/CSS"를 쓴다.
 *
 * 출력에서 항상 제외(§C2): 예시) 블록 · hint 안내 · 작성요령 · 교육부 평가지표 인용 박스 · ※ 작성방법.
 *   → 이 파일은 애초에 그런 요소를 만들지 않는다(데이터만 렌더).
 * 연도 표기는 전부 meta.year 파생값(하드코딩 금지, 3-1 "2025학년도" 오기 미사용).
 * ========================================================================== */
var Render = (function () {
  var e = function (s) { return U.esc(s); };
  // 변경(적색) 여부에 따라 class 부여
  function rc(changed) { return changed ? ' class="changed"' : ''; }

  /* 보고서 본문 전체 HTML(표지+1-1+1-2+1-3+2+3-1+3-2+별지1) */
  function buildReport(rep) {
    var y = rep.meta.year;
    var dept = e(rep.meta.deptName);
    var parts = [];
    parts.push(cover(y, dept));
    parts.push(sec1_1(rep, y, dept));
    parts.push(sec1_2(rep, dept));          // 가로(landscape)
    parts.push(sec1_3(rep, y, dept));
    parts.push(sec2(rep));
    parts.push(sec3_1(rep, y, dept));
    parts.push(sec3_2(rep));
    parts.push(sec3_3(rep));
    return parts.join('\n');
  }

  /* ── 표지 ── */
  function cover(y, dept) {
    return '<section class="sheet cover">' +
      '<div class="cover-year">' + y + '년도 ' + dept + '</div>' +
      '<h1 class="cover-title">교육과정 개편 보고서</h1>' +
      '<div class="cover-univ">학교법인 신일학원 · 서울사이버대학교</div>' +
      '</section>';
  }

  /* ── 1-1 교육목표·인재상 ── */
  function sec1_1(rep, y, dept) {
    var s = rep.sec1_1 || {}, uv = rep.univ || {};
    var goals = (s.goals || []).map(function (g) { return li(g); }).join('');
    var talents = (s.talents || []).map(function (t) { return li(t); }).join('');
    var jobs = (s.jobCompetencies || []).map(function (j) {
      var ch = U.isChanged(j.definition, j.prefillSnapshot);
      return '<tr><td class="jc-name"' + rc(ch) + '>' + e(j.name) + '</td><td' + rc(ch) + '>' + e(j.definition) + '</td></tr>';
    }).join('');
    var ovCh = s.overviewMeta ? U.isChanged(s.overview, s.overviewMeta.prefillSnapshot) : false;

    return '<section class="sheet">' +
      '<h2 class="sec-h">1-1. 학과/전공 교육목표 · 인재상</h2>' +
      '<table class="kv"><tbody>' +
      '<tr><th>대학 교육이념</th><td>' + e(uv.ideology) + '</td></tr>' +
      '<tr><th>대학 교육목적</th><td>' + e(uv.purpose) + '</td></tr>' +
      '<tr><th>대학 교육목표</th><td>' + (uv.goals || []).map(function (g) { return '<b>' + g.code + '</b> ' + e(g.text); }).join(' · ') + '</td></tr>' +
      '<tr><th>학과 교육목표</th><td><ol class="tight">' + goals + '</ol></td></tr>' +
      '<tr><th>학과 인재상</th><td><ol class="tight">' + talents + '</ol></td></tr>' +
      '<tr><th>학과 교육과정 개요</th><td' + rc(ovCh) + '>' + e(s.overview) + '</td></tr>' +
      '</tbody></table>' +
      '<h3 class="sub-h">④ 직무역량</h3>' +
      '<table class="tb"><thead><tr><th style="width:34%">역량명칭</th><th>역량정의</th></tr></thead><tbody>' +
      (jobs || '<tr><td></td><td></td></tr>') + '</tbody></table>' +
      '</section>';
  }
  function li(item) {
    var v = (item && typeof item === 'object') ? item.value : item;
    var ch = (item && typeof item === 'object') ? U.isChanged(item.value, item.prefillSnapshot) : false;
    return '<li' + rc(ch) + '>' + e(v) + '</li>';
  }

  /* ── 1-2 특성화 교육체계표 (가로 · 표준양식 클래스 그대로) ── */
  function sec1_2(rep, dept) {
    var s = rep.sec1_2 || {}, uv = rep.univ || {};
    // HEAD(한 줄 특성화·마이크로디그리) 프리필 대비 변경 여부 → 적색표시
    var hs = (s.headMeta && s.headMeta.snapshot) || null;
    function nrm(x) { return String(x == null ? '' : x).replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/g, ''); }
    function hc(cur, key) { return hs ? (nrm(cur) !== nrm(hs[key] || '')) : false; }
    var uChips = (uv.goals || []).map(function (g) {
      return '<div class="chip"><b>' + g.code + '</b>' + e(g.text) + '</div>';
    }).join('');
    var cCodes = (uv.competencies || []).map(function (c) {
      return '<span class="ccode">' + c.code + ' ' + e(c.name) + '</span>';
    }).join('');
    // 학과 교육목표(G)·직무역량(J) — 1-1 단일원본 파생(코드 자동), 읽기전용
    var s11 = rep.sec1_1 || {};
    var gGoals = (s11.goals || []).map(function (g, i) { return { code: 'G' + (i + 1), text: (g && typeof g === 'object') ? g.value : g }; });
    var jComps = (s11.jobCompetencies || []).map(function (j, i) { return { code: 'J' + (i + 1), name: (j && typeof j === 'object') ? (j.name || j.value || '') : j }; });
    var gChipsDept = gGoals.map(function (g) { return '<div class="gchip"><b>' + g.code + '</b>' + e(g.text) + '</div>'; }).join('');
    var jItems = jComps.map(function (j) { return '<span class="jitem"><b>' + j.code + '</b>' + e(j.name) + '</span>'; }).join('');
    var talents11 = (s11.talents || []).map(function (t) { return e((t && typeof t === 'object') ? t.value : t); }).join(' &nbsp; ');

    // 특성화 트랙 본표 (트랙 기준)
    var trackRows = (s.tracks || []).map(function (r) {
      var u = (r.uCodes || []).map(function (x) { return '<span class="ucode">' + e(x) + '</span>'; }).join('');
      var g = (r.gCodes || []).map(function (x) { return '<span class="gcode">' + e(x) + '</span>'; }).join('');
      var c = (r.cCodes || []).map(function (x) { return '<span class="ccode">' + e(x) + '</span>'; }).join('');
      var j = (r.jCodes || []).map(function (x) { return '<span class="jcode">' + e(x) + '</span>'; }).join('');
      var cur = '<span class="lv"><b>기초</b> ' + e(r.curriculum && r.curriculum.basic) + '</span>' +
                '<span class="lv"><b>심화</b> ' + e(r.curriculum && r.curriculum.advanced) + '</span>' +
                '<span class="lv"><b>응용</b> ' + e(r.curriculum && r.curriculum.applied) + '</span>';
      return '<tr' + rc(r.changed) + '><td class="trk">' + e(r.no) + (r.trackName ? '<small>' + e(r.trackName) + '</small>' : '') + '</td><td>' + u +
        '</td><td>' + g + '</td><td>' + c + j + '</td><td>' + cur + '</td><td>' + e(r.nonCurricular) + '</td></tr>';
    }).join('');
    var cert = s.cert || {};
    var micProg = cert.microPrograms || [];

    return '<section class="sheet sheet-land">' +
      '<h1 class="title">' + dept + ' 특성화 교육체계표</h1>' +
      '<div class="rule"></div>' +
      '<div class="band"><div class="band-left">대학 공통</div>' +
      '<div class="band-rows">' +
        '<div class="brow"><div class="blabel">교육이념</div><div class="bval">' + e(uv.ideology) + '</div></div>' +
        '<div class="brow"><div class="blabel">교육목적</div><div class="bval">' + e(uv.purpose) + '</div></div>' +
        '<div class="brow"><div class="blabel">대학 교육목표</div><div class="bval" style="padding:4px"><div class="chips" style="width:100%">' + uChips + '</div></div></div>' +
        '<div class="brow"><div class="blabel">인재상 · 핵심역량</div><div class="bval" style="font-size:8.8pt">' + (uv.talents || []).join(' · ') + ' │ ' + cCodes + '</div></div>' +
      '</div></div>' +
      '<div class="secbar">학과 교육목표, 인재상 및 특성화 체계</div>' +
      '<div class="deptline"><div class="dlabel-g">학과 교육목표<br>(G)</div><div class="dval"><div class="gchips">' + (gChipsDept || '<span class="hint">1-1 학과 교육목표에서 자동반영</span>') + '</div></div></div>' +
      '<div class="idline"><div class="idlabel">학과 인재상</div><div class="idval">' + talents11 + '</div></div>' +
      '<div class="deptline"><div class="dlabel-j">학과 직무역량<br>(J)</div><div class="dval"><div class="jrow">' + (jItems || '<span class="hint">1-1 직무역량 명칭에서 자동반영</span>') + '</div></div></div>' +
      '<div class="idline"><div class="idlabel">학과 특성화 한 줄</div><div class="idval' + (hc(s.oneLine, 'oneLine') ? ' changed' : '') + '">' + e(s.oneLine) + '</div></div>' +
      '<table class="main"><tr>' +
        '<th style="width:26mm">특성화 트랙</th><th class="w-u">연계 대학<br>교육목표</th><th class="w-g">연계 학과<br>교육목표</th>' +
        '<th class="w-cap">배양 역량<br>(C·J)</th><th class="w-cur">교육과정<br>선이수(기초→심화→응용)</th><th class="w-nc">비교과·현장연계</th>' +
      '</tr>' + trackRows + '</table>' +
      '<div class="prereq-note">※ 「교육과정」의 기초·심화·응용은 난이도가 아니라 <b>선이수(先履修) 순서 체계</b>입니다 — 1-3 로드맵의 수준(Lv1·Lv2·Lv3)과는 다른 축입니다.</div>' +
      '<div class="cert"><div class="cert-title">성과증거 및 학습성과 인증</div><div class="cert-body">' +
        '<div class="cert-col"><div class="cert-h micro"><span class="dot"></span>마이크로디그리 · 융합전공</div>' +
          '<div' + (hc(micProg.join(' | '), 'microPrograms') ? ' class="changed"' : '') + '>' + micProg.map(e).join(' │ ') + '</div>' +
          '<span class="sub">' + e(cert.microLinked || '') + '</span></div>' +
        '<div class="cert-col"><div class="cert-h evid"><span class="dot"></span>성과증거</div>' +
          '<div' + (hc(cert.evidence || '', 'evidence') ? ' class="changed"' : '') + '>' + e(cert.evidence || '') + '</div></div>' +
      '</div></div>' +
      '</section>';
  }

  /* ── 1-3 로드맵 (세로) ── */
  function sec1_3(rep, y, dept) {
    var cells = (rep.sec1_3 && rep.sec1_3.cells) || [];
    var grades = [1, 2, 3, 4], terms = ['1학기+하계', '2학기+동계'], levels = ['Lv1', 'Lv2', 'Lv3'];
    // 1-3 수준 타이틀 Lv1/Lv2/Lv3. 데이터는 구/신 값 모두 인식(기초|Lv1, 심화(핵심)|Lv2, 응용|Lv3).
    function levelKey(l) { var s = String(l || ''); if (s.indexOf('기초') === 0 || s.toLowerCase() === 'lv1') return 'Lv1'; if (s.indexOf('심화') === 0 || s.toLowerCase() === 'lv2') return 'Lv2'; if (s.indexOf('응용') === 0 || s.toLowerCase() === 'lv3') return 'Lv3'; return s; }
    function find(level, grade, term) {
      return cells.filter(function (c) { return levelKey(c.level) === levelKey(level) && Number(c.grade) === grade && c.term === term; });
    }
    var head = '<tr><th></th>' + grades.map(function (g) { return '<th colspan="2">' + g + '학년</th>'; }).join('') + '</tr>' +
               '<tr><th></th>' + grades.map(function () { return '<th>1학기+하계</th><th>2학기+동계</th>'; }).join('') + '</tr>';
    var body = levels.map(function (lv) {
      var tds = '';
      grades.forEach(function (g) {
        terms.forEach(function (tm) {
          var courses = [];
          find(lv, g, tm).forEach(function (c) { courses = courses.concat(c.courses || []); });
          tds += '<td>' + courses.map(function (c) {
            var ch = c.changed || U.isChanged(c.name, c.prefillSnapshot);
            return '<div' + rc(ch) + '>' + e(c.name) + (c.owner && c.owner !== '주관' ? '<span class="own">(' + e(c.owner) + ')</span>' : '') + '</div>';
          }).join('') + '</td>';
        });
      });
      return '<tr><th class="lvcol">' + lv + '</th>' + tds + '</tr>';
    }).join('');

    return '<section class="sheet">' +
      '<h2 class="sec-h">1-3. 교육과정 수준 단계별 로드맵</h2>' +
      '<table class="rm-out"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '</section>';
  }

  /* ── 2. 개편 방향 ── */
  function sec2(rep) {
    var s = rep.sec2 || {};
    if (rep.meta.noChange2) return '<section class="sheet"><h2 class="sec-h">2. 교육과정 개편 방향 및 타당성</h2><p class="nochange">교육과정 변경 없음</p></section>';
    var refs = (s.refs || []).map(function (r, i) { return '<li>[' + (i + 1) + '] ' + e(r.label) + ' — ' + e(r.url) + '</li>'; }).join('');
    return '<section class="sheet"><h2 class="sec-h">2. 교육과정 개편 방향 및 타당성</h2>' +
      '<table class="kv"><tbody>' +
      '<tr><th>① 산업체·사회적 요구</th><td>' + e(s.socialDemand) + '</td></tr>' +
      '<tr><th>② 학습자 수요 확인</th><td>' + e(s.learnerDemand) + '</td></tr>' +
      '<tr><th>③ 개편 사항</th><td>' + e(s.reformItems) + '</td></tr>' +
      '<tr><th>④ 개편 기대효과</th><td>' + e(s.expectedEffect) + '</td></tr>' +
      '</tbody></table>' + (refs ? '<div class="refs"><b>근거</b><ol class="tight">' + refs + '</ol></div>' : '') +
      '</section>';
  }

  /* ── 3-1 교과목 변경 내역 (연도 자동) ── */
  function sec3_1(rep, y, dept) {
    var rows = rep.sec3_1 || [];
    if (rep.meta.noChange3) return '<section class="sheet"><h2 class="sec-h">3-1. 교과목 변경 내역표</h2><p class="nochange">교육과정 변경 없음</p></section>';
    var body = rows.map(function (r, i) {
      var b = r.before || {}, a = r.after || {};
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td>' + e(b.name) + '</td><td>' + e(b.credit) + '</td><td>' + e(b.type) + '</td><td>' + e(b.grade) + '</td><td>' + e(b.term) + '</td>' +
        '<td class="changed">' + e(a.name) + '</td><td>' + e(a.nameEn) + '</td><td>' + e(a.credit) + '</td><td>' + e(a.type) + '</td><td>' + e(a.grade) + '</td><td>' + e(a.term) + '</td>' +
        '<td>' + e(r.changeType) + '</td><td>' + e(r.reason) + '</td><td>' + (r.sameCourse ? 'V' : '') + '</td><td>' + (r.certRelated ? 'V' : '') + '</td></tr>';
    }).join('');
    return '<section class="sheet"><h2 class="sec-h">3-1. 교과목 변경 내역표 — ' + y + '학년도 ' + dept + '</h2>' +
      '<table class="tb sm3"><thead>' +
      '<tr><th rowspan="2">연번</th><th colspan="5">기존 교육과정</th><th colspan="6">변경 교육과정</th><th rowspan="2">변경<br>사항</th><th rowspan="2">변경 사유</th><th rowspan="2">동일<br>교과</th><th rowspan="2">자격증<br>관련</th></tr>' +
      '<tr><th>과목명</th><th>학점</th><th>이수</th><th>학년</th><th>학기</th><th>과목명</th><th>영문명</th><th>학점</th><th>이수</th><th>학년</th><th>학기</th></tr>' +
      '</thead><tbody>' + (body || '<tr><td colspan="16"></td></tr>') + '</tbody></table></section>';
  }

  /* ── 3-2 팀티칭 ── */
  function sec3_2(rep) {
    var rows = rep.sec3_2 || [];
    if (!rows.length) return '';
    var body = rows.map(function (r, i) {
      var t1 = r.t1 || {}, t2 = r.t2 || {};
      return '<tr><td>' + (i + 1) + '</td><td>' + e(r.name) + '</td><td>' + e(r.credit) + '</td>' +
        '<td>' + e(t1.name) + '</td><td>' + (t1.isFullTime ? '전임' : '비전임') + '</td><td>' + e(t1.weeks) + '</td>' +
        '<td>' + e(t2.name) + '</td><td>' + (t2.isFullTime ? '전임' : '비전임') + '</td><td>' + e(t2.weeks) + '</td></tr>';
    }).join('');
    return '<section class="sheet"><h2 class="sec-h">3-2. 팀티칭 교과목 교원별 담당 주차</h2>' +
      '<table class="tb"><thead><tr><th>연번</th><th>과목명</th><th>학점</th><th>담당교원1</th><th>전임</th><th>주차</th><th>담당교원2</th><th>전임</th><th>주차</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></section>';
  }

  /* ── 별지1 교과목 기획서 (신설 수만큼 반복) ── */
  function sec3_3(rep) {
    var rows = rep.sec3_3 || [];
    if (!rows.length) return '';
    return rows.map(function (r) {
      var core = r.coreCompetencies || {};
      var coreHtml = Object.keys(core).map(function (k) {
        return '<div><b>' + e(k) + '</b> : ' + (core[k] || []).map(e).join(', ') + '</div>';
      }).join('');
      return '<section class="sheet"><h2 class="sec-h">[별지1] 교과목 기획서 — ' + e(r.courseNameKo) + '</h2>' +
        '<table class="kv"><tbody>' +
        '<tr><th>교과목명(한글)</th><td>' + e(r.courseNameKo) + '</td><th>영문</th><td>' + e(r.courseNameEn) + '</td></tr>' +
        '<tr><th>학점</th><td>' + e(r.credit) + '</td><th>자격증 관련</th><td>' + e(r.certRelated) + '</td></tr>' +
        '<tr><th>학년</th><td>' + e(r.grade) + '</td><th>이수구분</th><td>' + e(r.type) + '</td></tr>' +
        '<tr><th>개설학기</th><td colspan="3">' + (r.terms || []).map(e).join(', ') + '</td></tr>' +
        '<tr><th>핵심역량</th><td colspan="3">' + coreHtml + '</td></tr>' +
        '<tr><th>직무역량</th><td colspan="3">' + (r.jobCompetencies || []).map(e).join(', ') + '</td></tr>' +
        '<tr><th>개설 타당성</th><td colspan="3">' + e(r.rationale) + '</td></tr>' +
        '<tr><th>과목 소개</th><td colspan="3">' + e(r.outline && r.outline.intro) + '</td></tr>' +
        '<tr><th>개설 목적</th><td colspan="3">' + e(r.outline && r.outline.purpose) + '</td></tr>' +
        '<tr><th>교과 수준</th><td colspan="3">' + e(r.outline && r.outline.level) + '</td></tr>' +
        '<tr><th>역량 연계성</th><td colspan="3">' + e(r.linkage) + '</td></tr>' +
        '<tr><th>관련 자격증</th><td colspan="3">' + e(r.certs) + '</td></tr>' +
        '<tr><th>기존과목 유사성</th><td>' + e(r.similarExisting) + '</td><th>유사 기존과목명</th><td>' + e(r.similarName) + '</td></tr>' +
        '<tr><th>동일교과 처리</th><td colspan="3">' + e(r.sameCourse) + '</td></tr>' +
        '</tbody></table></section>';
    }).join('\n');
  }

  /* ── 다운로드: report.css 를 인라인으로 내장한 단일 HTML 파일 저장 ── */
  function download(rep) {
    fetchCss().then(function (css) {
      var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
        '<title>' + rep.meta.year + '학년도 교육과정개편보고서 ' + e(rep.meta.deptName) + '</title>' +
        '<style>' + css + '</style></head><body class="report">' +
        buildReport(rep) + '</body></html>';
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = rep.meta.year + '학년도_교육과정개편보고서_' + rep.meta.deptName + '.html';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  }
  function fetchCss() {
    return fetch('report.css').then(function (r) { return r.text(); }).catch(function () { return ''; });
  }

  return { buildReport: buildReport, download: download };
})();
