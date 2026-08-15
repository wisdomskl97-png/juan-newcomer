(function () {
  'use strict';

  var CONFIG = {
    teamPin: '0000',
    apiUrl: 'https://script.google.com/macros/s/AKfycbwtvopCUgaPnE8jvt0rOjxcH6I4mgSJyQE6AiumSg_bM034KdKX9VWLSYLogz7GdXOO/exec'
  };

  var state = {
    screen: 'welcome',
    submitting: false,
    submitError: '',
    showKakaoHelp: false,
    copiedSummary: false,
    copiedUnivMsg: false,
    sharedSummary: false,
    sharedUnivMsg: false,
    showUnivMsg: false,
    summaryFilter: 'all',
    editIndex: null,
    editDraft: {},
    editOriginal: '',
    showDiscard: false,
    editDeleteArm: false,
    pinInput: '',
    pinError: false,
    teamUnlocked: false,
    form: emptyForm(),
    errors: {},
    today: [],
    viewMode: 'today',
    archiveMonth: null,
    archiveDate: null,
    archive: []
  };

  function emptyForm() {
    return { name: '', contact: '', kakao: '', birth: '', leader: '', visa: '', visaOther: '', job: '', major: '', baptism: '', prevChurch: '', prevDept: '' };
  }

  var app = document.getElementById('app');

  // Phone "back" (gesture or hardware button) must feel like it's inside
  // the app, not like leaving it. We keep exactly ONE extra history entry
  // ("trap") pushed whenever there's anything to back out of — an open
  // overlay, or any screen other than the welcome/home screen. One back
  // press is caught by popstate, we close the topmost overlay or step to
  // the previous screen ourselves, then re-arm a fresh trap. Once back at
  // welcome with nothing open, we stop re-arming and a further back press
  // is a real exit. selfTriggeredBack guards the history.back() we issue
  // ourselves (e.g. tapping an in-app "홈으로" button) so that synthetic
  // popstate doesn't get reprocessed as if the user pressed back.
  var trapArmed = false;
  var selfTriggeredBack = false;

  window.addEventListener('popstate', function () {
    if (selfTriggeredBack) { selfTriggeredBack = false; return; }
    trapArmed = false;
    if (anyOverlay()) { closeTopOverlay(); }
    else if (state.screen !== 'welcome') { smartBack(); }
  });

  function anyOverlay() {
    return state.showDiscard || state.editDeleteArm || state.showKakaoHelp || state.showUnivMsg || state.editIndex !== null;
  }
  function closeTopOverlay() {
    if (state.showDiscard) return update(function () { state.showDiscard = false; });
    if (state.editDeleteArm) return update(function () { state.editDeleteArm = false; });
    if (state.showKakaoHelp) return update(function () { state.showKakaoHelp = false; });
    if (state.showUnivMsg) return update(function () { state.showUnivMsg = false; });
    if (state.editIndex !== null) return requestClose();
  }
  // Mirrors what each screen's own "Back"/"Home" button already does.
  function smartBack() {
    switch (state.screen) {
      case 'question':
        resetForm(); go('welcome'); break;
      case 'formGeneral':
      case 'formUniv':
        state.errors = {}; state.submitError = ''; go('question'); break;
      case 'completeGeneral':
      case 'completeUniv':
        resetForm(); go('welcome'); break;
      case 'pin':
        state.pinInput = ''; state.pinError = false; go('welcome'); break;
      default:
        go('welcome');
    }
  }
  function syncHistory() {
    var wantsTrap = anyOverlay() || state.screen !== 'welcome';
    try {
      if (wantsTrap && !trapArmed) { trapArmed = true; history.pushState({ trap: true }, ''); }
      else if (!wantsTrap && trapArmed) { trapArmed = false; selfTriggeredBack = true; history.back(); }
    } catch (e) {}
  }

  function update(mutator) {
    var active = document.activeElement;
    var id = active && active.id;
    var selStart = active && 'selectionStart' in active ? active.selectionStart : null;
    var selEnd = active && 'selectionEnd' in active ? active.selectionEnd : null;
    mutator();
    render();
    syncHistory();
    if (id) {
      var el = document.getElementById(id);
      if (el) {
        el.focus();
        if (selStart != null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }
  }

  function go(screen) {
    state.screen = screen;
    render();
    syncHistory();
    requestAnimationFrame(function () { window.scrollTo(0, 0); });
  }

  function resetForm() { state.form = emptyForm(); state.errors = {}; state.submitError = ''; }

  function validateGeneral() {
    var f = state.form, er = {};
    if (!f.name.trim()) er.name = '이름을 입력해주세요 / Please enter your name';
    if (!f.contact.trim()) er.contact = '연락처를 입력해주세요 / Please enter your contact';
    if (!f.birth) er.birth = '생년월일을 입력해주세요 / Please enter your birth date';
    if (!f.visa) er.visa = '비자 종류를 선택해주세요 / Please select a visa type';
    if (f.visa === '기타' && !f.visaOther.trim()) er.visaOther = '비자 종류를 입력해주세요 / Please enter your visa type';
    return er;
  }
  function validateUniv() {
    var f = state.form, er = {};
    if (!f.name.trim()) er.name = '이름을 입력해주세요 / Please enter your name';
    if (!f.contact.trim()) er.contact = '연락처를 입력해주세요 / Please enter your contact';
    if (!f.birth) er.birth = '생년월일을 입력해주세요 / Please enter your birth date';
    return er;
  }

  // Apps Script POST endpoints 302-redirect their actual response to a
  // script.googleusercontent.com "echo" URL. fetch() follows that
  // redirect as a GET automatically (per spec, for non-GET/HEAD methods
  // redirected via 301/302/303) — no special handling needed here, but
  // don't set a Content-Type header or it triggers a CORS preflight that
  // Apps Script web apps don't handle.
  function apiPost(payload) {
    return fetch(CONFIG.apiUrl, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (!result || !result.ok) throw new Error((result && result.error) || 'server error');
        return result;
      });
  }

  var SUBMIT_FAIL_MSG = '제출에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요. / Submission failed — please check your connection and try again.';

  function submitGeneral() {
    var er = validateGeneral();
    if (Object.keys(er).length) { update(function () { state.errors = er; }); return; }
    update(function () { state.submitting = true; state.submitError = ''; });
    var f = state.form;
    var year = f.birth ? f.birth.slice(0, 4) : '';
    var effVisa = f.visa === '기타' && f.visaOther.trim() ? f.visaOther : f.visa;
    apiPost({ action: 'submitGeneral', name: f.name, contact: f.contact, kakao: f.kakao, birth: f.birth, leader: f.leader, visa: effVisa, job: f.job, baptism: f.baptism, prevChurch: f.prevChurch, prevDept: f.prevDept })
      .then(function () {
        var info = { contact: f.contact, kakao: f.kakao, birth: f.birth, visa: effVisa, major: f.job, leader: f.leader, baptism: f.baptism, prevChurch: f.prevChurch, prevDept: f.prevDept };
        update(function () {
          state.submitting = false;
          state.today.push({ name: f.name, year: year, flow: 'general', info: info });
        });
        go('completeGeneral');
      })
      .catch(function () {
        update(function () { state.submitting = false; state.submitError = SUBMIT_FAIL_MSG; });
      });
  }

  function submitUniv() {
    var er = validateUniv();
    if (Object.keys(er).length) { update(function () { state.errors = er; }); return; }
    update(function () { state.submitting = true; state.submitError = ''; });
    var f = state.form;
    var effVisa = f.visa === '기타' && f.visaOther.trim() ? f.visaOther : f.visa;
    // Only name + birth ever leave the browser for the university flow —
    // contact/visa/major/etc. stay local for the share message only (옵션 A).
    apiPost({ action: 'submitUnivSummary', name: f.name, birth: f.birth })
      .then(function () {
        var info = { contact: f.contact, kakao: f.kakao, birth: f.birth, visa: effVisa, major: f.major, leader: f.leader, baptism: f.baptism, prevChurch: f.prevChurch, prevDept: f.prevDept };
        update(function () {
          state.submitting = false;
          state.today.push({ name: f.name, year: f.birth ? f.birth.slice(0, 4) : '', flow: 'univ', info: info });
        });
        go('completeUniv');
      })
      .catch(function () {
        update(function () { state.submitting = false; state.submitError = SUBMIT_FAIL_MSG; });
      });
  }

  function copyText(text, doneFlag) {
    function done() {
      update(function () { state[doneFlag] = true; });
      setTimeout(function () { update(function () { state[doneFlag] = false; }); }, 1800);
    }
    try { navigator.clipboard.writeText(text).then(done, done); } catch (e) { done(); }
  }
  // Falls back to copying when navigator.share isn't available (most
  // desktop browsers). fallbackFlag must be the button's OWN state key so
  // the button that was actually pressed shows the "copied" feedback,
  // not some other button on screen.
  function shareText(text, fallbackFlag) {
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); }
    else { copyText(text, fallbackFlag); }
  }

  function pinPress(d) {
    var cur = state.pinInput;
    if (cur.length >= 4) return;
    var next = cur + String(d);
    if (next.length < 4) { update(function () { state.pinInput = next; state.pinError = false; }); return; }
    if (next === String(CONFIG.teamPin)) {
      update(function () { state.teamUnlocked = true; state.pinInput = ''; state.pinError = false; });
      go('summary');
    } else {
      update(function () { state.pinInput = ''; state.pinError = true; });
    }
  }
  function pinDel() { update(function () { state.pinInput = state.pinInput.slice(0, -1); state.pinError = false; }); }

  function activeList() {
    if (state.viewMode === 'today') return state.today;
    var sess = state.archive.filter(function (x) { return x.date === state.archiveDate; })[0];
    return sess ? sess.people : [];
  }
  function serviceSunday() {
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
  }
  function serviceSundayLabel() {
    var d = serviceSunday();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function activeDateLabel() {
    if (state.viewMode === 'today') return serviceSundayLabel();
    if (!state.archiveDate) return '';
    var parts = state.archiveDate.split('-').map(Number);
    return parts[0] + '년 ' + parts[1] + '월 ' + parts[2] + '일';
  }
  function weekLabel(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var dd = parts[2];
    var ords = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];
    var ord = ords[Math.ceil(dd / 7) - 1];
    return parts[1] + '월 ' + ord + ' 주일 (' + parts[1] + '/' + dd + ')';
  }

  function line(label, v) { return v && String(v).trim() ? label + ': ' + v + '\n' : ''; }

  function univMessage() {
    var u = activeList().filter(function (p) { return p.flow === 'univ'; });
    var dateStr = activeDateLabel();
    var s = '[주안교회 대학목장 새가족 전달]\n' + dateStr + '\n대학목장 등록 ' + u.length + '명\n';
    u.forEach(function (p, i) {
      s += '\n' + (i + 1) + '. ' + p.name + '\n';
      if (p.info) {
        s += line('연락처', p.info.contact) + line('카카오톡', p.info.kakao) + line('생년월일', p.info.birth) + line('비자', p.info.visa) + line('전공', p.info.major) + line('인도자', p.info.leader) + line('세례여부', p.info.baptism) + line('이전출석교회', p.info.prevChurch) + line('이전봉사부서', p.info.prevDept);
      }
    });
    s += '\n대학팀에서 연락 부탁드립니다 🙏';
    return s;
  }
  function summaryText() {
    var t = state.today;
    var g = t.filter(function (p) { return p.flow === 'general'; }).length;
    var u = t.filter(function (p) { return p.flow === 'univ'; }).length;
    var s = '[주안교회 오늘 새가족 등록]\n' + serviceSundayLabel() + '\n총 ' + t.length + '명 · 일반목장 ' + g + '명 / 대학목장 ' + u + '명\n\n';
    t.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' (' + (p.year || '—') + ') · ' + (p.flow === 'univ' ? '대학목장' : '일반목장') + '\n'; });
    return s;
  }

  function startEdit(i) {
    var p = state.today[i], info = p.info || {};
    var draft = {
      name: p.name || '', year: p.year || '', flow: p.flow || 'general',
      contact: info.contact || '', kakao: info.kakao || '', birth: info.birth || '', visa: info.visa || '',
      major: info.major || '', leader: info.leader || '', baptism: info.baptism || '', prevChurch: info.prevChurch || '', prevDept: info.prevDept || ''
    };
    update(function () {
      state.editIndex = i; state.editDraft = draft; state.editOriginal = JSON.stringify(draft);
      state.showDiscard = false; state.editDeleteArm = false;
    });
  }
  function requestClose() {
    if (JSON.stringify(state.editDraft) !== state.editOriginal) update(function () { state.showDiscard = true; });
    else update(function () { state.editIndex = null; state.editDeleteArm = false; });
  }
  function saveEdit() {
    var d = state.editDraft, i = state.editIndex;
    if (i == null) return;
    var item = { name: d.name, year: d.year, flow: d.flow, info: { contact: d.contact, kakao: d.kakao, birth: d.birth, visa: d.visa, major: d.major, leader: d.leader, baptism: d.baptism, prevChurch: d.prevChurch, prevDept: d.prevDept } };
    update(function () {
      state.today[i] = item; state.editIndex = null; state.editDeleteArm = false; state.showDiscard = false;
    });
  }
  function deleteCurrent() {
    var i = state.editIndex;
    update(function () {
      state.today = state.today.filter(function (_, j) { return j !== i; });
      state.editIndex = null; state.editDeleteArm = false; state.showDiscard = false;
    });
  }

  /* ---------------- render helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldHtml(opts) {
    var id = opts.context + '-' + opts.field;
    var val = esc(opts.value);
    var reqMark = opts.required ? '<span class="req">*</span>' : '<span class="opt">(선택)</span>';
    var type = opts.type || 'text';
    var extra = opts.inputMode ? ' inputMode="' + opts.inputMode + '"' : '';
    var err = opts.error ? '<div class="error-msg" id="err-' + id + '"><span class="error-dot">!</span>' + esc(opts.error) + '</div>' : '';
    var labelHtml = opts.noLabel ? '' : ('<label>' + opts.label + ' ' + reqMark + '</label>');
    return (
      '<div class="field"' + (opts.noLabel ? ' style="margin-top:10px"' : '') + '>' +
      labelHtml +
      '<input id="' + id + '" type="' + type + '" data-context="' + opts.context + '" data-field="' + opts.field + '"' + extra +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      ' value="' + val + '" />' +
      err +
      '</div>'
    );
  }

  function selectHtml(opts) {
    var id = opts.context + '-' + opts.field;
    var reqMark = opts.required ? '<span class="req">*</span>' : '<span class="opt">(선택)</span>';
    var optsHtml = opts.options.map(function (o) {
      var sel = o.value === opts.value ? ' selected' : '';
      return '<option value="' + esc(o.value) + '"' + sel + '>' + esc(o.label) + '</option>';
    }).join('');
    var err = opts.error ? '<div class="error-msg"><span class="error-dot">!</span>' + esc(opts.error) + '</div>' : '';
    return (
      '<div class="field">' +
      '<label>' + opts.label + ' ' + reqMark + '</label>' +
      '<select id="' + id + '" data-context="' + opts.context + '" data-field="' + opts.field + '">' + optsHtml + '</select>' +
      err +
      '</div>'
    );
  }

  function renderWelcome(enter) {
    return (
      '<div class="screen screen-fill welcome ' + enter + '">' +
      '<img class="logo" src="image/juanlogo.png" alt="Sydney Jooan Church" />' +
      '<h1>주안 새가족등록</h1>' +
      '<p class="sub">JOOAN NEW FAMILY REGISTRATION</p>' +
      '<div class="welcome-card"><p>시드니 주안교회에<br/>오신 것을 진심으로 환영합니다.</p>' +
      '<p>We are so glad you\'re here.<br/>등록은 1~2분이면 완료됩니다.</p></div>' +
      '<div class="welcome-team-row"><button type="button" class="launcher" data-action="openSummary">팀원용 요약</button></div>' +
      '<div class="welcome-spacer"></div>' +
      '<button class="btn btn-primary-univ" data-action="goStart">시작하기 · Start</button>' +
      '</div>'
    );
  }

  function renderQuestion(enter) {
    return (
      '<div class="screen question ' + enter + '">' +
      '<button class="btn-pill" data-action="goHome">🏠 홈으로</button>' +
      '<div class="progress-row"><div class="progress-bar on"></div><div class="progress-bar off"></div><span class="progress-label">1 / 2</span></div>' +
      '<div>' +
      '<div class="q-eyebrow"><span class="q-dot" style="background:#F2C230;margin-left:0"></span><span class="q-dot" style="background:#E07B2C"></span><span class="q-dot" style="background:#8E5AA8"></span><span class="q-eyebrow-label">어느 목장에서 만날까요?</span></div>' +
      '<h2 class="q-title">현재 학생비자이거나, 시드니에서 대학 재학 또는 입학 예정이신가요?</h2>' +
      '<p class="q-sub">Are you on a student visa, or studying / about to study at a university in Sydney?</p>' +
      '<div class="q-options">' +
      '<button class="q-option q-option-yes" data-action="chooseYes"><span class="q-badge q-badge-yes">예</span><span><span class="q-option-title">예 · Yes</span><span class="q-option-sub">학생비자 · 대학 재학/입학 예정</span></span></button>' +
      '<button class="q-option q-option-no" data-action="chooseNo"><span class="q-badge q-badge-no">아니오</span><span><span class="q-option-title">아니오 · No</span><span class="q-option-sub">위 내용에 해당하지 않음</span></span></button>' +
      '</div>' +
      '<p class="q-footnote">편하게 골라주세요. 어떤 목장이든 반갑게 맞이할게요 🙂<br/>Either way, we\'re so glad you\'re here.</p>' +
      '</div></div>'
    );
  }

  var VISA_OPTIONS_GENERAL = [
    { value: '', label: '선택해주세요 / Select' },
    { value: '워킹홀리데이', label: '워킹홀리데이 / Working Holiday' },
    { value: '영주권', label: '영주권 / PR' },
    { value: '시민권', label: '시민권 / Citizen' },
    { value: '여행', label: '여행 / Tourist' },
    { value: '학생', label: '학생 / Student' },
    { value: '기타', label: '기타 / Other' }
  ];
  var VISA_OPTIONS_UNIV = [
    { value: '', label: '선택해주세요 / Select' },
    { value: '학생', label: '학생 / Student' },
    { value: '워킹홀리데이', label: '워킹홀리데이 / Working Holiday' },
    { value: '영주권', label: '영주권 / PR' },
    { value: '시민권', label: '시민권 / Citizen' },
    { value: '여행', label: '여행 / Tourist' },
    { value: '기타', label: '기타 / Other' }
  ];
  var BAPTISM_OPTIONS = [
    { value: '', label: '선택 안 함' },
    { value: '세례', label: '세례 받음' },
    { value: '유아세례', label: '유아세례' },
    { value: '미세례', label: '미세례' },
    { value: '모름', label: '잘 모름' }
  ];

  function kakaoLabelRow(context) {
    return (
      '<div class="field"><div class="field-label-row"><label style="margin:0">카카오톡 ID <span class="opt">(선택)</span></label>' +
      '<button type="button" class="help-dot" data-action="openKakaoHelp" title="카카오톡 ID 확인 방법">i</button></div>' +
      '<input id="' + context + '-kakao" type="text" data-context="' + context + '" data-field="kakao" placeholder="Kakao ID" value="' + esc(state[context === 'form' ? 'form' : 'editDraft'].kakao) + '" />' +
      '</div>'
    );
  }

  function renderFormGeneral(enter) {
    var f = state.form, er = state.errors;
    return (
      '<div class="screen form-screen ' + enter + '">' +
      '<button class="btn-pill" data-action="goBack">← 목장 다시 선택 · Back</button>' +
      '<div class="step-row"><div class="step-bar"></div><div class="step-bar"></div><span class="step-label">2 / 2</span></div>' +
      '<h2 class="form-title">새가족 등록</h2><p class="form-sub">New Family Registration</p>' +
      '<div class="section-head"><span class="section-bar"></span><h3>기본정보 · Basic</h3></div>' +
      fieldHtml({ context: 'form', field: 'name', label: '이름 / Name', required: true, value: f.name, placeholder: '예) 홍길동 / Gil-dong Hong', error: er.name }) +
      fieldHtml({ context: 'form', field: 'contact', label: '연락처 / Contact', required: true, value: f.contact, placeholder: '예) 0400 000 000', inputMode: 'tel', error: er.contact }) +
      '<div class="field-row">' + kakaoLabelRow('form') +
      '<div class="field"><label>생년월일 / Birth <span class="req">*</span></label><input id="form-birth" type="date" data-context="form" data-field="birth" value="' + esc(f.birth) + '" /></div>' +
      '</div>' +
      (er.birth ? '<div class="error-msg" id="err-form-birth" style="margin:-8px 0 16px">' + '<span class="error-dot">!</span>' + esc(er.birth) + '</div>' : '') +
      fieldHtml({ context: 'form', field: 'leader', label: '인도자 / Invited by', required: false, value: f.leader, placeholder: '나를 초대한 분' }) +
      '<div class="section-head"><span class="section-bar"></span><h3>교회 관련 · Church</h3></div>' +
      selectHtml({ context: 'form', field: 'baptism', label: '세례 여부 / Baptism', required: false, value: f.baptism, options: BAPTISM_OPTIONS }) +
      fieldHtml({ context: 'form', field: 'prevChurch', label: '이전 출석교회', required: false, value: f.prevChurch, placeholder: 'Previous church' }) +
      fieldHtml({ context: 'form', field: 'prevDept', label: '이전 봉사부서', required: false, value: f.prevDept, placeholder: '예) 찬양팀, 주일학교' }) +
      '<div class="section-head"><span class="section-bar"></span><h3>생활 정보 · Life</h3></div>' +
      selectHtml({ context: 'form', field: 'visa', label: '비자 종류 / Visa', required: true, value: f.visa, options: VISA_OPTIONS_GENERAL, error: er.visa }) +
      (f.visa === '기타' ? fieldHtml({ context: 'form', field: 'visaOther', noLabel: true, value: f.visaOther, placeholder: '비자 종류를 직접 입력 / Enter visa type', error: er.visaOther }) : '') +
      fieldHtml({ context: 'form', field: 'job', label: '전공 또는 직업', required: false, value: f.job, placeholder: 'Major or occupation' }) +
      (state.submitError ? '<div class="error-msg" style="margin-top:6px">' + '<span class="error-dot">!</span>' + esc(state.submitError) + '</div>' : '') +
      '<button class="btn btn-primary-general" data-action="submitGeneral" ' + (state.submitting ? 'disabled' : '') + '>' +
      (state.submitting ? '<span class="spinner"></span>' : '') + (state.submitting ? '제출 중…' : '제출하기 · Submit') +
      '</button>' +
      '</div>'
    );
  }

  function renderFormUniv(enter) {
    var f = state.form, er = state.errors;
    return (
      '<div class="screen form-screen ' + enter + '">' +
      '<button class="btn-pill btn-pill-univ" data-action="goBack">← 목장 다시 선택 · Back</button>' +
      '<div class="step-row"><div class="step-bar univ"></div><div class="step-bar univ"></div><span class="step-label">2 / 2</span></div>' +
      '<h2 class="form-title">대학목장에서 따로 연락드릴게요!</h2>' +
      '<p class="form-sub">대학생·청년을 위한 대학목장이 있습니다. 아래 정보를 남겨주시면 대학팀에서 곧 연락드립니다.<br/><span class="en">Our university team will reach out to you soon.</span></p>' +
      '<div class="form-univ-body">' +
      fieldHtml({ context: 'form', field: 'name', label: '이름 / Name', required: true, value: f.name, placeholder: '예) 홍길동', error: er.name }) +
      fieldHtml({ context: 'form', field: 'contact', label: '연락처 / Contact', required: true, value: f.contact, placeholder: '예) 0400 000 000', inputMode: 'tel', error: er.contact }) +
      '<div class="field-row">' + kakaoLabelRow('form') +
      '<div class="field"><label>생년월일 / Birth <span class="req">*</span></label><input id="form-birth" type="date" data-context="form" data-field="birth" value="' + esc(f.birth) + '" /></div>' +
      '</div>' +
      (er.birth ? '<div class="error-msg" id="err-form-birth" style="margin:-8px 0 16px">' + '<span class="error-dot">!</span>' + esc(er.birth) + '</div>' : '') +
      selectHtml({ context: 'form', field: 'visa', label: '비자 종류 / Visa', required: false, value: f.visa, options: VISA_OPTIONS_UNIV }) +
      (f.visa === '기타' ? fieldHtml({ context: 'form', field: 'visaOther', noLabel: true, value: f.visaOther, placeholder: '비자 종류를 직접 입력 / Enter visa type' }) : '') +
      fieldHtml({ context: 'form', field: 'major', label: '전공 / Major', required: false, value: f.major, placeholder: '예) 회계학, IT' }) +
      fieldHtml({ context: 'form', field: 'leader', label: '인도자 / Invited by', required: false, value: f.leader, placeholder: '나를 초대한 분' }) +
      '<div class="section-head"><span class="section-bar univ"></span><h3>교회 관련 · Church</h3></div>' +
      selectHtml({ context: 'form', field: 'baptism', label: '세례 여부 / Baptism', required: false, value: f.baptism, options: BAPTISM_OPTIONS }) +
      fieldHtml({ context: 'form', field: 'prevChurch', label: '이전 출석교회', required: false, value: f.prevChurch, placeholder: 'Previous church' }) +
      fieldHtml({ context: 'form', field: 'prevDept', label: '이전 봉사부서', required: false, value: f.prevDept, placeholder: '예) 찬양팀, 주일학교' }) +
      (state.submitError ? '<div class="error-msg" style="margin-top:6px">' + '<span class="error-dot">!</span>' + esc(state.submitError) + '</div>' : '') +
      '<button class="btn btn-primary-univ" data-action="submitUniv" ' + (state.submitting ? 'disabled' : '') + '>' +
      (state.submitting ? '<span class="spinner"></span>' : '') + (state.submitting ? '제출 중…' : '제출하기 · Submit') +
      '</button>' +
      '</div></div>'
    );
  }

  var CHECK_SVG = '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  function renderCompleteGeneral(enter) {
    return (
      '<div class="screen complete ' + enter + '">' +
      '<div class="complete-icon general">' + CHECK_SVG.replace('stroke-width', 'stroke="#4B5AA3" stroke-width') + '</div>' +
      '<h2>등록이 완료되었어요!</h2>' +
      '<p class="lead">주안교회 가족이 되신 것을<br/>진심으로 환영합니다. 🎉</p>' +
      '<p class="sub">Welcome to the Jooan Church family!<br/>담당 목자가 곧 연락드릴 예정입니다.</p>' +
      '<button class="btn btn-outline-general" data-action="registerAgain">＋ 한 명 더 등록하기 · Register another</button>' +
      '<button class="btn btn-ghost" data-action="goHome">🏠 홈으로 돌아가기 · Home</button>' +
      '</div>'
    );
  }
  function renderCompleteUniv(enter) {
    return (
      '<div class="screen complete ' + enter + '" style="min-height:auto;padding-top:40px">' +
      '<div class="complete-icon univ">' + CHECK_SVG.replace('width="46" height="46"', 'width="42" height="42"').replace('stroke-width', 'stroke="#E07B2C" stroke-width') + '</div>' +
      '<h2 style="font-size:24px">등록이 완료되었어요!</h2>' +
      '<p class="lead">대학목장 담당자가<br/>곧 연락드릴 예정입니다. 🎓</p>' +
      '<p class="sub">Our university team will reach out to you soon.<br/>주안교회에 오신 것을 환영합니다!</p>' +
      '<button class="btn btn-outline-univ" data-action="registerAgain">＋ 한 명 더 등록하기 · Register another</button>' +
      '<button class="btn btn-ghost" data-action="goHome">🏠 홈으로 돌아가기 · Home</button>' +
      '</div>'
    );
  }

  function renderPin(enter) {
    var dots = [0, 1, 2, 3].map(function (i) {
      return '<span class="pin-dot ' + (i < state.pinInput.length ? 'filled' : 'empty') + '"></span>';
    }).join('');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function (k) {
      if (k === '') return '<span class="pin-key blank"></span>';
      var label = k === 'del' ? '⌫' : k;
      return '<button type="button" class="pin-key" data-action="' + (k === 'del' ? 'pinDel' : 'pinPress') + '" data-value="' + esc(k) + '">' + label + '</button>';
    }).join('');
    return (
      '<div class="screen pin ' + enter + '">' +
      '<button class="btn-pill pin-cancel" style="background:rgba(255,255,255,.1);color:#B7BBCB" data-action="pinCancel">← 앱으로</button>' +
      '<div class="pin-body">' +
      '<div class="pin-lock">🔒</div><h2>팀원 확인</h2>' +
      '<p>요약을 보려면 PIN 4자리를 입력하세요<br/>Enter the 4-digit team PIN</p>' +
      '<div class="pin-dots">' + dots + '</div>' +
      '<div class="pin-error-slot">' + (state.pinError ? 'PIN이 올바르지 않습니다. 다시 입력해주세요.' : '') + '</div>' +
      '<div class="pin-keys">' + keys + '</div>' +
      '</div></div>'
    );
  }

  function renderSummary(enter) {
    var s = state;
    var showStats = s.viewMode === 'today' || (s.viewMode === 'archive' && !!s.archiveDate);
    var people = activeList();
    var editable = s.viewMode === 'today';
    var filtered = people.filter(function (p) { return s.summaryFilter === 'all' || (s.summaryFilter === 'univ' ? p.flow === 'univ' : p.flow !== 'univ'); });
    var totalCount = people.length;
    var generalCount = people.filter(function (p) { return p.flow === 'general'; }).length;
    var univCount = people.filter(function (p) { return p.flow === 'univ'; }).length;

    var html = '<div class="screen ' + enter + '" style="padding:0">';
    html += '<div class="summary-head">';
    html += '<div class="summary-head-row"><span class="label">팀원용 · TEAM ONLY</span><button class="btn-pill" style="background:rgba(255,255,255,.1);color:#B7BBCB" data-action="backToApp">← 앱으로</button></div>';
    html += '<div class="summary-tabs">';
    html += '<button class="summary-tab ' + (s.viewMode === 'today' ? 'active' : '') + '" data-action="setViewToday">오늘</button>';
    html += '<button class="summary-tab ' + (s.viewMode === 'archive' ? 'active' : '') + '" data-action="setViewArchive">지난 기록</button>';
    html += '</div>';
    html += '<h2>등록 요약</h2>';
    html += '<p class="sub">' + esc(showStats ? activeDateLabel() : (s.viewMode === 'archive' && s.archiveMonth ? '주일을 선택하세요' : '달을 선택하세요')) + '</p>';
    if (showStats) {
      html += '<div class="stat-row">';
      html += '<button class="stat-card" data-action="setFilterAll"><div class="stat-num">' + totalCount + '</div><div class="stat-label">총 등록</div>' + (s.summaryFilter === 'all' ? '<div class="stat-line all"></div>' : '') + '</button>';
      html += '<button class="stat-card" data-action="setFilterGeneral"><div class="stat-num general">' + generalCount + '</div><div class="stat-label">일반목장</div>' + (s.summaryFilter === 'general' ? '<div class="stat-line general"></div>' : '') + '</button>';
      html += '<button class="stat-card" data-action="setFilterUniv"><div class="stat-num univ">' + univCount + '</div><div class="stat-label">대학목장</div>' + (s.summaryFilter === 'univ' ? '<div class="stat-line univ"></div>' : '') + '</button>';
      html += '</div><p class="stat-hint">카드를 눌러 목장별로 필터링하세요 · Tap a card to filter</p>';
    }
    html += '</div>';

    html += '<div class="summary-body">';

    if (s.viewMode === 'archive' && !s.archiveMonth) {
      var months = uniqueMonths();
      html += '<p class="picker-title">달을 선택하세요</p>';
      html += '<div class="archive-year">' + archiveYearLabel(months) + '</div>';
      html += '<div class="month-grid">';
      months.forEach(function (k) {
        html += '<button class="month-chip" data-action="pickMonth" data-key="' + esc(k) + '">' + Number(k.slice(5, 7)) + '월</button>';
      });
      html += '</div>';
    } else if (s.viewMode === 'archive' && s.archiveMonth && !s.archiveDate) {
      var weeks = s.archive.filter(function (x) { return x.date.slice(0, 7) === s.archiveMonth; });
      html += '<button class="back-chip" data-action="backToMonths">← 달 다시 선택</button>';
      html += '<p class="picker-title">주일을 선택하세요</p><div class="week-list">';
      weeks.forEach(function (w) {
        html += '<button class="week-row" data-action="pickWeek" data-date="' + esc(w.date) + '">' +
          '<span class="week-icon">📅</span><span class="week-info"><span class="name">' + esc(weekLabel(w.date)) + '</span><span class="count">' + w.people.length + '명 등록</span></span><span class="chev">›</span></button>';
      });
      html += '</div>';
    }

    if (showStats) {
      if (s.viewMode === 'archive' && s.archiveDate) {
        html += '<button class="back-chip" data-action="backToWeeks">← 주일 다시 선택</button>';
      }
      html += '<div class="people-list">';
      if (!filtered.length) {
        html += '<div class="list-empty">해당 목장에 등록된 새가족이 없습니다.</div>';
      }
      filtered.forEach(function (p) {
        var realIndex = people.indexOf(p);
        var initial = (p.name || '?').trim().charAt(0);
        var yearLabel = p.year ? p.year + '년생' : '출생연도 미입력';
        var tag = p.flow === 'univ' ? '<span class="tag tag-univ">대학</span>' : '<span class="tag tag-general">일반</span>';
        var chev = editable ? '<span class="chev">›</span>' : '';
        var action = editable ? ' data-action="startEdit" data-index="' + realIndex + '"' : '';
        html += '<button class="person-row"' + action + (editable ? '' : ' style="cursor:default"') + '>' +
          '<span class="person-avatar">' + esc(initial) + '</span>' +
          '<div class="person-info"><div class="person-name">' + esc(p.name) + '</div><div class="person-meta"><span class="person-year">' + esc(yearLabel) + '</span>' + tag + '</div></div>' +
          chev + '</button>';
      });
      html += '</div>';

      var hasUnivToday = people.some(function (p) { return p.flow === 'univ'; }) && s.summaryFilter !== 'general';
      if (hasUnivToday) {
        html += '<button class="univ-msg-btn" data-action="openUnivMsg">🎓 대학목장 전달 메시지 만들기</button>';
      }
      html += '<div class="summary-actions">';
      html += '<button class="act-primary" data-action="copySummary">' + (s.copiedSummary ? '✓ 복사됨' : '복사하기 · Copy') + '</button>';
      html += '<button class="act-secondary" data-action="shareSummary">' + (s.sharedSummary ? '✓ 복사됨' : '공유하기 · Share') + '</button>';
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  function uniqueMonths() {
    var seen = {}, out = [];
    state.archive.forEach(function (x) { var k = x.date.slice(0, 7); if (!seen[k]) { seen[k] = true; out.push(k); } });
    return out;
  }
  function archiveYearLabel(months) {
    var years = {}; var out = [];
    months.forEach(function (k) { var y = k.slice(0, 4); if (!years[y]) { years[y] = true; out.push(y); } });
    return (out.length ? out.join(' · ') : String(new Date().getFullYear())) + '년';
  }

  function renderCornerLogo() {
    if (state.screen === 'welcome' || state.screen === 'summary' || state.screen === 'pin') return '';
    return '<img class="corner-logo" src="image/juanlogo.png" alt="" />';
  }

  function renderKakaoHelp(enter) {
    if (!state.showKakaoHelp) return '';
    return (
      '<div class="overlay ' + enter + '" data-overlay="kakao"><div class="sheet">' +
      '<div class="sheet-head"><h3>카카오톡 ID 확인 방법</h3><button class="btn-pill" data-action="closeKakaoHelp">← Back</button></div>' +
      '<p class="sheet-sub">How to find your Kakao ID</p>' +
      '<ol class="kakao-steps">' +
      '<li><span class="kakao-num">1</span><span class="txt">화면 하단 네비게이션에서 <b>사람 아이콘</b>을 누릅니다.</span></li>' +
      '<li><span class="kakao-num">2</span><span class="txt">화면 오른쪽 위의 <b>톱니바퀴(설정) 아이콘</b>을 누릅니다.</span></li>' +
      '<li><span class="kakao-num">3</span><span class="txt">상단 오른쪽의 <b>친구 추가(+) 아이콘</b>을 누릅니다.</span></li>' +
      '<li><span class="kakao-num">4</span><span class="txt">내 이름 아래에 표시되는 <b>카카오톡 ID</b>를 확인합니다.</span></li>' +
      '</ol></div></div>'
    );
  }

  function renderUnivMsg(enter) {
    if (!state.showUnivMsg) return '';
    return (
      '<div class="overlay ' + enter + '" data-overlay="univmsg"><div class="sheet">' +
      '<div class="sheet-head"><h3>대학목장 전달 메시지</h3><button class="btn-pill" style="color:#D06C1E;background:#FBEEDF" data-action="closeUnivMsg">닫기</button></div>' +
      '<p class="sheet-sub">오늘 대학목장으로 등록한 새가족 정보입니다. 복사해 대학팀에 전달해 주세요.</p>' +
      '<div class="univ-msg-box"><pre>' + esc(univMessage()) + '</pre></div>' +
      '<div class="sheet-actions">' +
      '<button style="color:#fff;background:#E07B2C" data-action="copyUnivMsg">' + (state.copiedUnivMsg ? '✓ 복사됨' : '복사하기 · Copy') + '</button>' +
      '<button style="color:#D06C1E;background:#FBEEDF" data-action="shareUnivMsg">' + (state.sharedUnivMsg ? '✓ 복사됨' : '공유하기 · Share') + '</button>' +
      '</div></div></div>'
    );
  }

  function renderEditSheet(enter, discardEnter) {
    if (state.editIndex === null) return '';
    var d = state.editDraft;
    var isGeneral = d.flow !== 'univ';
    var html = '<div class="overlay ' + enter + '" data-overlay="edit"><div class="sheet edit-sheet">';
    html += '<div class="sheet-head" style="margin-bottom:16px"><button class="btn-pill" data-action="requestClose">← 뒤로</button><h3>등록 정보 수정</h3></div>';
    html += '<label class="edit-label">목장 구분</label>';
    html += '<div class="edit-flow-toggle">';
    html += '<button type="button" class="edit-flow-btn ' + (isGeneral ? 'active-general' : '') + '" data-action="setEditFlowGeneral">일반목장</button>';
    html += '<button type="button" class="edit-flow-btn ' + (!isGeneral ? 'active-univ' : '') + '" data-action="setEditFlowUniv">대학목장</button>';
    html += '</div>';

    function ef(field, label, type) {
      type = type || 'text';
      return '<div class="edit-field"><label class="edit-label">' + label + '</label><input id="editDraft-' + field + '" type="' + type + '" data-context="editDraft" data-field="' + field + '" value="' + esc(d[field]) + '" /></div>';
    }

    html += ef('name', '이름 / Name');
    html += ef('year', '태어난 해', 'text');
    html += '<div class="edit-divider"></div><p class="edit-detail-label">상세 정보</p>';
    html += ef('contact', '연락처 / Contact', 'tel');
    html += '<div class="field-row">';
    html += '<div class="edit-field" style="flex:1"><label class="edit-label">카카오톡 ID</label><input id="editDraft-kakao" type="text" data-context="editDraft" data-field="kakao" value="' + esc(d.kakao) + '" /></div>';
    html += '<div class="edit-field" style="flex:1"><label class="edit-label">생년월일</label><input id="editDraft-birth" type="date" data-context="editDraft" data-field="birth" value="' + esc(d.birth) + '" /></div>';
    html += '</div>';
    html += '<div class="field-row">';
    html += '<div class="edit-field" style="flex:1"><label class="edit-label">비자 종류</label><input id="editDraft-visa" type="text" data-context="editDraft" data-field="visa" value="' + esc(d.visa) + '" /></div>';
    html += '<div class="edit-field" style="flex:1"><label class="edit-label">전공 / 직업</label><input id="editDraft-major" type="text" data-context="editDraft" data-field="major" value="' + esc(d.major) + '" /></div>';
    html += '</div>';
    html += ef('leader', '인도자');
    html += '<div class="edit-field"><label class="edit-label">세례 여부</label><select id="editDraft-baptism" data-context="editDraft" data-field="baptism">' +
      BAPTISM_OPTIONS.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === d.baptism ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
      '</select></div>';
    html += ef('prevChurch', '이전 출석교회');
    html += ef('prevDept', '이전 봉사부서');

    html += '<button class="save-btn" data-action="saveEdit">저장하기 · Save</button>';

    html += '<div class="delete-zone">';
    if (!state.editDeleteArm) {
      html += '<button class="delete-idle-btn" data-action="armDelete">🗑 이 등록 삭제하기</button>';
    } else {
      html += '<div class="delete-confirm"><p>이 등록을 삭제할까요? 되돌릴 수 없습니다.</p><div class="delete-confirm-row">' +
        '<button class="delete-confirm-yes" data-action="deleteCurrent">삭제</button>' +
        '<button class="delete-confirm-no" data-action="disarmDelete">취소</button></div></div>';
    }
    html += '</div>';

    if (state.showDiscard) {
      html += '<div class="discard-overlay ' + discardEnter + '" data-overlay="discard"><div class="discard-box">' +
        '<p>저장되지 않은 변경사항</p><p>변경한 내용을 저장하지 않고<br/>나가시겠어요?</p>' +
        '<div class="discard-row"><button class="discard-no" data-action="confirmDiscard">저장 안 함</button><button class="discard-yes" data-action="cancelDiscard">계속 수정</button></div>' +
        '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  var SCREEN_RENDERERS = {
    welcome: renderWelcome,
    question: renderQuestion,
    formGeneral: renderFormGeneral,
    formUniv: renderFormUniv,
    completeGeneral: renderCompleteGeneral,
    completeUniv: renderCompleteUniv,
    pin: renderPin,
    summary: renderSummary
  };

  // The DOM is fully rebuilt on every render(), so any CSS entrance
  // animation on a root element would replay on EVERY interaction (every
  // PIN digit, every filter tap), not just on real screen/overlay
  // transitions. Track what was open on the previous render and only hand
  // out the animating class when something just opened.
  var prevSnapshot = { screen: null, kakao: false, univmsg: false, editing: false, discard: false };

  function render() {
    var cur = {
      screen: state.screen,
      kakao: state.showKakaoHelp,
      univmsg: state.showUnivMsg,
      editing: state.editIndex !== null,
      discard: state.showDiscard
    };
    var screenEnter = cur.screen !== prevSnapshot.screen ? 'screen-enter' : '';
    var kakaoEnter = cur.kakao && !prevSnapshot.kakao ? 'overlay-enter' : '';
    var univmsgEnter = cur.univmsg && !prevSnapshot.univmsg ? 'overlay-enter' : '';
    var editEnter = cur.editing && !prevSnapshot.editing ? 'overlay-enter' : '';
    var discardEnter = cur.discard && !prevSnapshot.discard ? 'discard-enter' : '';

    var body = (SCREEN_RENDERERS[state.screen] || renderWelcome)(screenEnter);
    var html = '<div class="app-shell">' + body + renderCornerLogo() +
      renderKakaoHelp(kakaoEnter) + renderUnivMsg(univmsgEnter) + renderEditSheet(editEnter, discardEnter) +
      '</div>';
    app.innerHTML = html;
    prevSnapshot = cur;
  }

  /* ---------------- event delegation ---------------- */

  var ACTIONS = {
    goStart: function () { go('question'); },
    goHome: function () { update(function () { resetForm(); }); go('welcome'); },
    goBack: function () { update(function () { state.errors = {}; state.submitError = ''; }); go('question'); },
    chooseYes: function () { update(function () { state.errors = {}; }); go('formUniv'); },
    chooseNo: function () { update(function () { state.errors = {}; }); go('formGeneral'); },
    openKakaoHelp: function () { update(function () { state.showKakaoHelp = true; }); },
    closeKakaoHelp: function () { update(function () { state.showKakaoHelp = false; }); },
    submitGeneral: submitGeneral,
    submitUniv: submitUniv,
    registerAgain: function () { update(function () { resetForm(); }); go('question'); },
    openSummary: function () {
      if (state.teamUnlocked) { go('summary'); }
      else { update(function () { state.pinInput = ''; state.pinError = false; }); go('pin'); }
    },
    backToApp: function () { go('welcome'); },
    pinCancel: function () { update(function () { state.pinInput = ''; state.pinError = false; }); go('welcome'); },
    pinPress: function (el) { pinPress(el.getAttribute('data-value')); },
    pinDel: pinDel,
    setViewToday: function () { update(function () { state.viewMode = 'today'; state.archiveMonth = null; state.archiveDate = null; state.summaryFilter = 'all'; }); },
    setViewArchive: function () { update(function () { state.viewMode = 'archive'; state.summaryFilter = 'all'; }); },
    pickMonth: function (el) { update(function () { state.archiveMonth = el.getAttribute('data-key'); state.archiveDate = null; }); },
    pickWeek: function (el) { update(function () { state.archiveDate = el.getAttribute('data-date'); state.summaryFilter = 'all'; }); },
    backToMonths: function () { update(function () { state.archiveMonth = null; state.archiveDate = null; }); },
    backToWeeks: function () { update(function () { state.archiveDate = null; state.summaryFilter = 'all'; }); },
    setFilterAll: function () { update(function () { state.summaryFilter = 'all'; }); },
    setFilterGeneral: function () { update(function () { state.summaryFilter = state.summaryFilter === 'general' ? 'all' : 'general'; }); },
    setFilterUniv: function () { update(function () { state.summaryFilter = state.summaryFilter === 'univ' ? 'all' : 'univ'; }); },
    startEdit: function (el) { startEdit(Number(el.getAttribute('data-index'))); },
    requestClose: requestClose,
    setEditFlowGeneral: function () { update(function () { state.editDraft.flow = 'general'; }); },
    setEditFlowUniv: function () { update(function () { state.editDraft.flow = 'univ'; }); },
    saveEdit: saveEdit,
    armDelete: function () { update(function () { state.editDeleteArm = true; }); },
    disarmDelete: function () { update(function () { state.editDeleteArm = false; }); },
    deleteCurrent: deleteCurrent,
    confirmDiscard: function () { update(function () { state.editIndex = null; state.showDiscard = false; state.editDeleteArm = false; }); },
    cancelDiscard: function () { update(function () { state.showDiscard = false; }); },
    openUnivMsg: function () { update(function () { state.showUnivMsg = true; }); },
    closeUnivMsg: function () { update(function () { state.showUnivMsg = false; }); },
    copyUnivMsg: function () { copyText(univMessage(), 'copiedUnivMsg'); },
    shareUnivMsg: function () { shareText(univMessage(), 'sharedUnivMsg'); },
    copySummary: function () { copyText(summaryText(), 'copiedSummary'); },
    shareSummary: function () { shareText(summaryText(), 'sharedSummary'); }
  };

  app.addEventListener('click', function (e) {
    var overlayEl = e.target.closest && e.target.closest('[data-overlay]');
    if (overlayEl && e.target === overlayEl) {
      var kind = overlayEl.getAttribute('data-overlay');
      if (kind === 'kakao') return ACTIONS.closeKakaoHelp();
      if (kind === 'univmsg') return ACTIONS.closeUnivMsg();
      if (kind === 'edit') return ACTIONS.requestClose();
      if (kind === 'discard') return ACTIONS.cancelDiscard();
    }
    var target = e.target.closest && e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var fn = ACTIONS[action];
    if (fn) fn(target);
  });

  function clearInlineError(context, field) {
    var err = document.getElementById('err-' + context + '-' + field);
    if (err) err.parentNode.removeChild(err);
  }

  // Text/date inputs: update state in place WITHOUT a full re-render.
  // A full innerHTML rebuild mid-keystroke destroys and recreates the
  // focused <input>, which breaks Korean (and other IME) composition —
  // jamo commit individually instead of combining into syllable blocks —
  // and causes visible flicker/layout jumps on mobile.
  app.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.hasAttribute || !t.hasAttribute('data-field') || t.tagName === 'SELECT') return;
    var context = t.getAttribute('data-context');
    var field = t.getAttribute('data-field');
    var target = context === 'editDraft' ? state.editDraft : state.form;
    target[field] = t.value;
    if (context === 'form' && state.errors[field]) {
      state.errors[field] = undefined;
      clearInlineError(context, field);
    }
  });

  // Selects have no IME composition concerns, and a change may need to
  // reveal/hide conditional fields (e.g. visa "기타"), so a full render is fine.
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.hasAttribute || !t.hasAttribute('data-field') || t.tagName !== 'SELECT') return;
    var context = t.getAttribute('data-context');
    var field = t.getAttribute('data-field');
    update(function () {
      var target = context === 'editDraft' ? state.editDraft : state.form;
      target[field] = t.value;
      if (context === 'form' && state.errors[field]) state.errors[field] = undefined;
    });
  });

  render();
})();
