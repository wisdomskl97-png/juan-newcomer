(function () {
  'use strict';

  var CONFIG = {
    teamPin: '0691',
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
    showSummaryPreview: false,
    summaryFilter: 'all',
    searchQuery: '',
    editIndex: null,
    editMode: 'view',
    editDraft: {},
    editOriginal: '',
    showDiscard: false,
    editDeleteArm: false,
    editSaving: false,
    editSaveError: '',
    pinInput: '',
    pinError: false,
    teamUnlocked: false,
    summaryLoading: false,
    summaryLoadError: '',
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
    return state.showDiscard || state.editDeleteArm || state.showKakaoHelp || state.showUnivMsg || state.showSummaryPreview || state.editIndex !== null;
  }
  function closeTopOverlay() {
    if (state.showDiscard) return update(function () { state.showDiscard = false; });
    if (state.editDeleteArm) return update(function () { state.editDeleteArm = false; });
    if (state.showKakaoHelp) return update(function () { state.showKakaoHelp = false; });
    if (state.showUnivMsg) return update(function () { state.showUnivMsg = false; });
    if (state.showSummaryPreview) return update(function () { state.showSummaryPreview = false; });
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
    // A full re-render tears down and rebuilds the DOM, so any scrollable
    // overlay body (the edit sheet, kakao help, etc.) loses its scroll
    // position and snaps back to the top — most noticeable when arming
    // the delete confirmation scrolls the whole card back up on you.
    // There's only ever one .sheet open at a time, so this is unambiguous.
    var sheetEl = document.querySelector('.sheet');
    var sheetScrollTop = sheetEl ? sheetEl.scrollTop : null;
    mutator();
    render();
    syncHistory();
    if (sheetScrollTop != null) {
      var newSheetEl = document.querySelector('.sheet');
      if (newSheetEl) newSheetEl.scrollTop = sheetScrollTop;
    }
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
    persistRegSession();
    requestAnimationFrame(function () { window.scrollTo(0, 0); });
  }

  function resetForm() { state.form = emptyForm(); state.errors = {}; state.submitError = ''; }

  // As the user types digits into the birth field, insert dashes at the
  // yyyy-MM-dd positions automatically (19950101 -> 1995-01-01) so they
  // never have to type the dashes themselves or touch a calendar picker.
  function digitsToYmd(raw) {
    var digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    var y = digits.slice(0, 4), m = digits.slice(4, 6), d = digits.slice(6, 8);
    var out = y;
    if (m) out += '-' + m;
    if (d) out += '-' + d;
    return out;
  }
  function isValidYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12) return false;
    var daysInMonth = new Date(y, mo, 0).getDate();
    return d >= 1 && d <= daysInMonth;
  }
  var BIRTH_FORMAT_MSG = '생년월일 형식을 확인해주세요 (예: 1995-01-01) / Please check the date format (e.g. 1995-01-01)';

  function validateGeneral() {
    var f = state.form, er = {};
    if (!f.name.trim()) er.name = '이름을 입력해주세요 / Please enter your name';
    if (!f.contact.trim()) er.contact = '연락처를 입력해주세요 / Please enter your contact';
    if (!f.birth) er.birth = '생년월일을 입력해주세요 / Please enter your birth date';
    else if (!isValidYmd(f.birth)) er.birth = BIRTH_FORMAT_MSG;
    if (!f.visa) er.visa = '비자 종류를 선택해주세요 / Please select a visa type';
    if (f.visa === '기타' && !f.visaOther.trim()) er.visaOther = '비자 종류를 입력해주세요 / Please enter your visa type';
    return er;
  }
  function validateUniv() {
    var f = state.form, er = {};
    if (!f.name.trim()) er.name = '이름을 입력해주세요 / Please enter your name';
    if (!f.contact.trim()) er.contact = '연락처를 입력해주세요 / Please enter your contact';
    if (!f.birth) er.birth = '생년월일을 입력해주세요 / Please enter your birth date';
    else if (!isValidYmd(f.birth)) er.birth = BIRTH_FORMAT_MSG;
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
    apiPost({ action: 'submitUniv', name: f.name, contact: f.contact, kakao: f.kakao, birth: f.birth, leader: f.leader, visa: effVisa, job: f.major, baptism: f.baptism, prevChurch: f.prevChurch, prevDept: f.prevDept })
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

  // A real browser reload (not an in-app screen change) always wipes
  // in-memory state back to the welcome screen — sessionStorage is the
  // only thing that survives it. We only remember "team is on the
  // summary screen", not any actual data, so a refresh there re-fetches
  // from the sheet rather than resurrecting stale state.
  var TEAM_SESSION_KEY = 'juanTeamSession';
  function persistTeamSession(onSummary) {
    try {
      if (onSummary) sessionStorage.setItem(TEAM_SESSION_KEY, '1');
      else sessionStorage.removeItem(TEAM_SESSION_KEY);
    } catch (e) {}
  }
  function hadTeamSession() {
    try { return sessionStorage.getItem(TEAM_SESSION_KEY) === '1'; }
    catch (e) { return false; }
  }

  // Same idea for the registration flow: a refresh on 목장분류/새가족
  // 등록/대학목장 shouldn't dump the new family member back to welcome
  // and lose what they've already typed. Only screen + form fields are
  // kept — nothing sensitive is added beyond what they're already
  // mid-typing into the form.
  var REG_SESSION_KEY = 'juanRegSession';
  var REG_SCREENS = { question: true, formGeneral: true, formUniv: true };
  function persistRegSession() {
    try {
      if (REG_SCREENS[state.screen]) {
        sessionStorage.setItem(REG_SESSION_KEY, JSON.stringify({ screen: state.screen, form: state.form }));
      } else {
        sessionStorage.removeItem(REG_SESSION_KEY);
      }
    } catch (e) {}
  }
  function restoreRegSession() {
    try {
      var raw = sessionStorage.getItem(REG_SESSION_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || !REG_SCREENS[saved.screen] || !saved.form) return;
      var merged = emptyForm();
      for (var k in saved.form) { if (merged.hasOwnProperty(k)) merged[k] = saved.form[k]; }
      state.screen = saved.screen;
      state.form = merged;
    } catch (e) {}
  }

  function pinPress(d) {
    var cur = state.pinInput;
    if (cur.length >= 4) return;
    var next = cur + String(d);
    if (next.length < 4) { update(function () { state.pinInput = next; state.pinError = false; }); return; }
    if (next === String(CONFIG.teamPin)) {
      update(function () { state.teamUnlocked = true; state.pinInput = ''; state.pinError = false; });
      persistTeamSession(true);
      go('summary');
      loadSummaryData();
    } else {
      update(function () { state.pinInput = ''; state.pinError = true; });
    }
  }
  function pinDel() { update(function () { state.pinInput = state.pinInput.slice(0, -1); state.pinError = false; }); }

  // A registration filed any day this week (Mon–Sat) belongs to the
  // upcoming Sunday's service, same as the backend files it under — so
  // "오늘" here means "this week's Sunday", not literally today's date.
  // On a Sunday itself the two are the same date anyway.
  function currentServiceSunday() {
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
  }
  function todayDateStr() {
    var d = currentServiceSunday();
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    if (mm.length < 2) mm = '0' + mm;
    if (dd.length < 2) dd = '0' + dd;
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  // Team summary is a read of DailySummary in Google Sheets, not of
  // anything kept in the browser — state.today/state.archive only ever
  // hold what THIS load fetched, so every entry into the summary screen
  // re-fetches to stay current with what other devices have submitted.
  function loadSummaryData() {
    update(function () { state.summaryLoading = true; state.summaryLoadError = ''; });
    var url = CONFIG.apiUrl + '?action=getSummary&pin=' + encodeURIComponent(CONFIG.teamPin);
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (!result || !result.ok) throw new Error((result && result.error) || 'load failed');
        var grouped = groupSummaryRecords(result.records || []);
        update(function () { state.summaryLoading = false; state.today = grouped.today; state.archive = grouped.archive; });
      })
      .catch(function () {
        update(function () { state.summaryLoading = false; state.summaryLoadError = '요약 데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'; });
      });
  }

  function groupSummaryRecords(records) {
    var todayStr = todayDateStr();
    var todayList = [];
    var byDate = {};
    records.forEach(function (r) {
      var person = { name: r.name, year: r.year || '', flow: r.group === '대학목장' ? 'univ' : 'general', info: r.info || {}, row: r.row };
      if (r.date === todayStr) todayList.push(person);
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(person);
    });
    var archive = Object.keys(byDate).sort().reverse().map(function (d) { return { date: d, people: byDate[d] }; });
    return { today: todayList, archive: archive };
  }

  function activeList() {
    if (isSearching()) return searchMatches();
    if (state.viewMode === 'today') return state.today;
    var sess = state.archive.filter(function (x) { return x.date === state.archiveDate; })[0];
    return sess ? sess.people : [];
  }

  function isSearching() {
    return !!(state.searchQuery && state.searchQuery.trim());
  }

  // Search spans every date, not just whatever tab/week is currently
  // selected — state.archive already holds everyone grouped by date, so
  // flatten it rather than restricting to the active tab.
  function searchMatches() {
    var q = state.searchQuery.trim().toLowerCase();
    var qDigits = q.replace(/\D/g, '');
    var out = [];
    state.archive.forEach(function (group) {
      group.people.forEach(function (p) {
        var nameMatch = p.name && p.name.toLowerCase().indexOf(q) !== -1;
        var contact = p.info && p.info.contact ? String(p.info.contact).replace(/\D/g, '') : '';
        var contactMatch = qDigits.length >= 3 && contact.indexOf(qDigits) !== -1;
        if (nameMatch || contactMatch) out.push(p);
      });
    });
    return out;
  }

  function dateForPerson(p) {
    for (var i = 0; i < state.archive.length; i++) {
      if (state.archive[i].people.indexOf(p) !== -1) return state.archive[i].date;
    }
    return '';
  }

  function shortDateLabel(dateStr) {
    var parts = String(dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[1] || !parts[2]) return '';
    return parts[1] + '월 ' + parts[2] + '일';
  }
  function todayLabel() {
    var d = currentServiceSunday();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function activeDateLabel() {
    if (state.viewMode === 'today') return todayLabel();
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
    var t = activeList();
    var g = t.filter(function (p) { return p.flow === 'general'; }).length;
    var u = t.filter(function (p) { return p.flow === 'univ'; }).length;
    var s = '[주안교회 새가족 등록 요약]\n' + activeDateLabel() + '\n총 ' + t.length + '명 · 일반목장 ' + g + '명 / 대학목장 ' + u + '명\n';
    t.forEach(function (p, i) {
      s += '\n' + (i + 1) + '. ' + p.name + ' (' + (p.year || '—') + '년생) · ' + (p.flow === 'univ' ? '대학목장' : '일반목장') + '\n';
      if (p.info) {
        s += line('연락처', p.info.contact) + line('카카오톡', p.info.kakao) + line('생년월일', p.info.birth) + line('비자', p.info.visa) + line('전공', p.info.major) + line('인도자', p.info.leader) + line('세례여부', p.info.baptism) + line('이전출석교회', p.info.prevChurch) + line('이전봉사부서', p.info.prevDept);
      }
    });
    return s;
  }

  function startEdit(i) {
    // realIndex (passed in as i) is computed from activeList() at render
    // time, which is state.today OR the currently-picked archive week's
    // people — never always state.today, now that 지난 기록 is editable too.
    var p = activeList()[i], info = p.info || {};
    var draft = {
      row: p.row,
      name: p.name || '', year: p.year || '', flow: p.flow || 'general',
      contact: info.contact || '', kakao: info.kakao || '', birth: info.birth || '', visa: info.visa || '',
      major: info.major || '', leader: info.leader || '', baptism: info.baptism || '', prevChurch: info.prevChurch || '', prevDept: info.prevDept || ''
    };
    update(function () {
      state.editIndex = i; state.editDraft = draft; state.editOriginal = JSON.stringify(draft);
      state.editMode = 'view'; // open read-only first — an accidental tap shouldn't drop them straight into an editable form
      state.showDiscard = false; state.editDeleteArm = false; state.editSaving = false; state.editSaveError = '';
    });
  }
  function requestClose() {
    if (state.editSaving) return; // don't let the sheet close out from under an in-flight save/delete
    if (JSON.stringify(state.editDraft) !== state.editOriginal) update(function () { state.showDiscard = true; });
    else update(function () { state.editIndex = null; state.editDeleteArm = false; });
  }
  // Both save and delete write straight to the sheet — Newcomers is the
  // only place this data lives, so a purely local edit would just look
  // reverted the next time the summary reloads (which is exactly the bug
  // this replaced: deletes "coming back" after a refresh because they'd
  // never actually left the sheet).
  function saveEdit() {
    var d = state.editDraft;
    if (!d.row) return;
    update(function () { state.editSaving = true; state.editSaveError = ''; });
    apiPost({
      action: 'updateRegistrant', row: d.row,
      name: d.name, contact: d.contact, kakao: d.kakao, birth: d.birth,
      leader: d.leader, visa: d.visa, job: d.major, baptism: d.baptism,
      prevChurch: d.prevChurch, prevDept: d.prevDept,
      group: d.flow === 'univ' ? '대학목장' : '일반목장'
    }).then(function () {
      update(function () { state.editIndex = null; state.editDeleteArm = false; state.showDiscard = false; state.editSaving = false; });
      loadSummaryData();
    }).catch(function () {
      update(function () { state.editSaving = false; state.editSaveError = '저장에 실패했습니다. 다시 시도해주세요.'; });
    });
  }
  function deleteCurrent() {
    var d = state.editDraft;
    if (!d.row) return;
    update(function () { state.editSaving = true; state.editSaveError = ''; });
    apiPost({ action: 'deleteRegistrant', row: d.row }).then(function () {
      update(function () { state.editIndex = null; state.editDeleteArm = false; state.showDiscard = false; state.editSaving = false; });
      loadSummaryData();
    }).catch(function () {
      update(function () { state.editSaving = false; state.editSaveError = '삭제에 실패했습니다. 다시 시도해주세요.'; });
    });
  }

  /* ---------------- render helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function viewRow(label, value) {
    return '<div class="edit-field"><label class="edit-label">' + label + '</label><div class="view-value">' + (value ? esc(value) : '<span class="view-empty">—</span>') + '</div></div>';
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
      fieldHtml({ context: 'form', field: 'birth', label: '생년월일 / Birth', required: true, value: f.birth, type: 'text', inputMode: 'numeric', placeholder: 'YYYY-MM-DD', error: er.birth }) +
      '</div>' +
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
      fieldHtml({ context: 'form', field: 'birth', label: '생년월일 / Birth', required: true, value: f.birth, type: 'text', inputMode: 'numeric', placeholder: 'YYYY-MM-DD', error: er.birth }) +
      '</div>' +
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
    var html = '<div class="screen ' + enter + '" style="padding:0">';
    html += '<div class="summary-head">';
    html += '<div class="summary-head-row"><span class="label">팀원용 · TEAM ONLY</span><div style="display:flex;gap:8px">' +
      '<button class="btn-pill" style="background:rgba(255,255,255,.1);color:#B7BBCB" data-action="reloadSummary" title="새로고침 · Refresh"' + (s.summaryLoading ? ' disabled' : '') + '>' + (s.summaryLoading ? '⟳' : '↻') + ' 새로고침</button>' +
      '<button class="btn-pill" data-action="backToApp">🏠 홈으로</button>' +
      '</div></div>';
    html += '<div class="summary-tabs">';
    html += '<button class="summary-tab ' + (s.viewMode === 'today' ? 'active' : '') + '" data-action="setViewToday">오늘</button>';
    html += '<button class="summary-tab ' + (s.viewMode === 'archive' ? 'active' : '') + '" data-action="setViewArchive">지난 기록</button>';
    html += '</div>';
    html += '<div class="search-row">' +
      '<span class="search-icon">🔍</span>' +
      '<input id="search-searchQuery" type="text" inputMode="search" data-context="search" data-field="searchQuery" placeholder="이름 또는 연락처로 검색" value="' + esc(s.searchQuery) + '" />' +
      // Always rendered (not conditional on searchQuery) — the search input
      // triggers a targeted re-render of just #summaryResults to protect
      // IME composition, which can't reach this button to add/remove it,
      // so its visibility is toggled directly from that same input handler.
      '<button type="button" id="searchClearBtn" class="search-clear" data-action="clearSearch" style="visibility:' + (s.searchQuery ? 'visible' : 'hidden') + '">✕</button>' +
      '</div>';
    html += '<h2>등록 요약</h2>';
    html += '<div id="summaryStats">' + renderSummaryStats() + '</div>';
    html += '</div>';
    html += '<div class="summary-body" id="summaryResults">' + renderSummaryList() + '</div>';
    html += '</div>';
    return html;
  }

  // Split out from renderSummary() so the search box can trigger a
  // targeted refresh of these two parts (see the 'search' context branch
  // in the input handler) without touching the search <input> itself —
  // a full render() would destroy/recreate it mid-keystroke and break
  // Korean IME composition, same class of bug fixed elsewhere. Two
  // separate containers (not one) because the date/stat-card line lives
  // on the dark header background and the list lives on the white body
  // background — merging them into a single container would put white
  // background under the date/stats, same visual bug this replaced.
  function renderSummaryStats() {
    var s = state;
    var searching = isSearching();
    var showStats = searching || s.viewMode === 'today' || (s.viewMode === 'archive' && !!s.archiveDate);
    var people = activeList();
    var filtered = people.filter(function (p) { return s.summaryFilter === 'all' || (s.summaryFilter === 'univ' ? p.flow === 'univ' : p.flow !== 'univ'); });
    var totalCount = people.length;
    var generalCount = people.filter(function (p) { return p.flow === 'general'; }).length;
    var univCount = people.filter(function (p) { return p.flow === 'univ'; }).length;

    var html = '';
    var subLabel = searching ? '검색 결과 · ' + filtered.length + '건'
      : showStats ? activeDateLabel()
      : (s.viewMode === 'archive' && s.archiveMonth ? '주일을 선택하세요' : '달을 선택하세요');
    html += '<p class="sub">' + esc(subLabel) + '</p>';
    if (showStats) {
      html += '<div class="stat-row">';
      html += '<button class="stat-card" data-action="setFilterAll"><div class="stat-num">' + totalCount + '</div><div class="stat-label">총 등록</div>' + (s.summaryFilter === 'all' ? '<div class="stat-line all"></div>' : '') + '</button>';
      html += '<button class="stat-card" data-action="setFilterGeneral"><div class="stat-num general">' + generalCount + '</div><div class="stat-label">일반목장</div>' + (s.summaryFilter === 'general' ? '<div class="stat-line general"></div>' : '') + '</button>';
      html += '<button class="stat-card" data-action="setFilterUniv"><div class="stat-num univ">' + univCount + '</div><div class="stat-label">대학목장</div>' + (s.summaryFilter === 'univ' ? '<div class="stat-line univ"></div>' : '') + '</button>';
      html += '</div><p class="stat-hint">카드를 눌러 목장별로 필터링하세요 · Tap a card to filter</p>';
    }
    return html;
  }

  function renderSummaryList() {
    var s = state;
    var searching = isSearching();
    var showStats = searching || s.viewMode === 'today' || (s.viewMode === 'archive' && !!s.archiveDate);
    var people = activeList();
    var editable = showStats;
    var filtered = people.filter(function (p) { return s.summaryFilter === 'all' || (s.summaryFilter === 'univ' ? p.flow === 'univ' : p.flow !== 'univ'); });

    if (s.summaryLoading) return '<div class="list-empty">불러오는 중… · Loading…</div>';
    if (s.summaryLoadError) {
      return '<div class="list-empty">' + esc(s.summaryLoadError) + '</div>' +
        '<button class="back-chip" data-action="reloadSummary" style="margin-top:10px">다시 시도 · Retry</button>';
    }

    var html = '';
    if (!searching && s.viewMode === 'archive' && !s.archiveMonth) {
      var months = uniqueMonths();
      html += '<p class="picker-title">달을 선택하세요</p>';
      html += '<div class="archive-year">' + archiveYearLabel(months) + '</div>';
      html += '<div class="month-grid">';
      months.forEach(function (k) {
        html += '<button class="month-chip" data-action="pickMonth" data-key="' + esc(k) + '">' + Number(k.slice(5, 7)) + '월</button>';
      });
      html += '</div>';
    } else if (!searching && s.viewMode === 'archive' && s.archiveMonth && !s.archiveDate) {
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
      if (!searching && s.viewMode === 'archive' && s.archiveDate) {
        html += '<button class="back-chip" data-action="backToWeeks">← 주일 다시 선택</button>';
      }
      html += '<div class="people-list">';
      if (!filtered.length) {
        html += '<div class="list-empty">' + (searching ? '‘' + esc(s.searchQuery.trim()) + '’에 해당하는 등록자가 없습니다.' : '해당 목장에 등록된 새가족이 없습니다.') + '</div>';
      }
      filtered.forEach(function (p) {
        var realIndex = people.indexOf(p);
        var initial = (p.name || '?').trim().charAt(0);
        var yearLabel = p.year ? p.year + '년생' : '출생연도 미입력';
        if (searching) {
          var dateLabel = shortDateLabel(dateForPerson(p));
          yearLabel += dateLabel ? ' · ' + dateLabel + ' 등록' : '';
        }
        var tag = p.flow === 'univ' ? '<span class="tag tag-univ">대학</span>' : '<span class="tag tag-general">일반</span>';
        var chev = editable ? '<span class="chev">›</span>' : '';
        var action = editable ? ' data-action="startEdit" data-index="' + realIndex + '"' : '';
        html += '<button class="person-row"' + action + (editable ? '' : ' style="cursor:default"') + '>' +
          '<span class="person-avatar">' + esc(initial) + '</span>' +
          '<div class="person-info"><div class="person-name">' + esc(p.name) + '</div><div class="person-meta"><span class="person-year">' + esc(yearLabel) + '</span>' + tag + '</div></div>' +
          chev + '</button>';
      });
      html += '</div>';

      if (!searching) {
        var hasUnivToday = people.some(function (p) { return p.flow === 'univ'; }) && s.summaryFilter !== 'general';
        if (hasUnivToday) {
          html += '<button class="univ-msg-btn" data-action="openUnivMsg">🎓 대학목장 전달 메시지 만들기</button>';
        }
        html += '<button class="act-primary act-full" data-action="openSummaryPreview">' + (s.viewMode === 'today' ? '오늘 등록 요약 보기' : '등록 요약 보기') + '</button>';
      }
    }

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
  function renderWelcomeTeam() {
    if (state.screen !== 'welcome') return '';
    return '<div class="welcome-team-corner"><button type="button" class="launcher" data-action="openSummary">팀원용 요약</button></div>';
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

  function renderSummaryPreview(enter) {
    if (!state.showSummaryPreview) return '';
    return (
      '<div class="overlay ' + enter + '" data-overlay="summarypreview"><div class="sheet">' +
      '<div class="sheet-head"><h3>' + (state.viewMode === 'today' ? '오늘 등록 요약' : '등록 요약') + '</h3><button class="btn-pill" data-action="closeSummaryPreview">닫기</button></div>' +
      '<p class="sheet-sub">아래 내용을 복사하거나 바로 공유할 수 있습니다.</p>' +
      '<div class="univ-msg-box"><pre>' + esc(summaryText()) + '</pre></div>' +
      '<div class="sheet-actions">' +
      '<button style="color:#fff;background:#4B5AA3" data-action="copySummary">' + (state.copiedSummary ? '✓ 복사됨' : '복사하기 · Copy') + '</button>' +
      '<button style="color:#4B5AA3;background:#EDEFF8" data-action="shareSummary">' + (state.sharedSummary ? '✓ 복사됨' : '공유하기 · Share') + '</button>' +
      '</div></div></div>'
    );
  }

  function renderEditSheet(enter, discardEnter) {
    if (state.editIndex === null) return '';
    var d = state.editDraft;
    var isGeneral = d.flow !== 'univ';
    var isEdit = state.editMode === 'edit';
    var html = '<div class="overlay ' + enter + '" data-overlay="edit"><div class="sheet edit-sheet">';
    html += '<div class="sheet-head" style="margin-bottom:16px"><button class="btn-pill" data-action="requestClose">← 뒤로</button><h3>' + (isEdit ? '등록 정보 수정' : '등록 정보') + '</h3></div>';

    if (!isEdit) {
      html += viewRow('목장 구분', isGeneral ? '일반목장' : '대학목장');
      html += viewRow('이름 / Name', d.name);
      html += viewRow('태어난 해', d.year);
      html += '<div class="edit-divider"></div><p class="edit-detail-label">상세 정보</p>';
      html += viewRow('연락처 / Contact', d.contact);
      html += viewRow('카카오톡 ID', d.kakao);
      html += viewRow('생년월일', d.birth);
      html += viewRow('비자 종류', d.visa);
      html += viewRow('전공 / 직업', d.major);
      html += viewRow('인도자', d.leader);
      html += viewRow('세례 여부', d.baptism);
      html += viewRow('이전 출석교회', d.prevChurch);
      html += viewRow('이전 봉사부서', d.prevDept);
      html += '<button class="save-btn" data-action="enterEditMode">✎ 정보 수정하기 · Edit</button>';
    } else {
      html += '<label class="edit-label">목장 구분</label>';
      html += '<div class="edit-flow-toggle">';
      html += '<button type="button" class="edit-flow-btn ' + (isGeneral ? 'active-general' : '') + '" data-action="setEditFlowGeneral">일반목장</button>';
      html += '<button type="button" class="edit-flow-btn ' + (!isGeneral ? 'active-univ' : '') + '" data-action="setEditFlowUniv">대학목장</button>';
      html += '</div>';

      var ef = function (field, label, type) {
        type = type || 'text';
        return '<div class="edit-field"><label class="edit-label">' + label + '</label><input id="editDraft-' + field + '" type="' + type + '" data-context="editDraft" data-field="' + field + '" value="' + esc(d[field]) + '" /></div>';
      };

      html += ef('name', '이름 / Name');
      html += ef('year', '태어난 해', 'text');
      html += '<div class="edit-divider"></div><p class="edit-detail-label">상세 정보</p>';
      html += ef('contact', '연락처 / Contact', 'tel');
      html += '<div class="field-row">';
      html += '<div class="edit-field" style="flex:1"><label class="edit-label">카카오톡 ID</label><input id="editDraft-kakao" type="text" data-context="editDraft" data-field="kakao" value="' + esc(d.kakao) + '" /></div>';
      html += '<div class="edit-field" style="flex:1"><label class="edit-label">생년월일</label><input id="editDraft-birth" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" data-context="editDraft" data-field="birth" value="' + esc(d.birth) + '" /></div>';
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

      if (state.editSaveError) {
        html += '<div class="error-msg" style="margin-top:14px"><span class="error-dot">!</span>' + esc(state.editSaveError) + '</div>';
      }
      html += '<button class="save-btn" data-action="saveEdit"' + (state.editSaving ? ' disabled' : '') + '>' + (state.editSaving ? '저장 중… · Saving' : '저장하기 · Save') + '</button>';
      html += '<button class="btn-ghost" style="width:100%;margin-top:6px" data-action="exitEditMode"' + (state.editSaving ? ' disabled' : '') + '>취소하고 보기로 돌아가기</button>';
    }

    html += '<div class="delete-zone">';
    if (!state.editDeleteArm) {
      html += '<button class="delete-idle-btn" data-action="armDelete"' + (state.editSaving ? ' disabled' : '') + '>🗑 이 등록 삭제하기</button>';
    } else {
      html += '<div class="delete-confirm"><p>이 등록을 삭제할까요? 앱에서는 되돌릴 수 없습니다.</p><div class="delete-confirm-row">' +
        '<button class="delete-confirm-yes" data-action="deleteCurrent"' + (state.editSaving ? ' disabled' : '') + '>' + (state.editSaving ? '삭제 중…' : '삭제') + '</button>' +
        '<button class="delete-confirm-no" data-action="disarmDelete"' + (state.editSaving ? ' disabled' : '') + '>취소</button></div></div>';
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
  var prevSnapshot = { screen: null, kakao: false, univmsg: false, summaryPreview: false, editing: false, discard: false };

  function render() {
    var cur = {
      screen: state.screen,
      kakao: state.showKakaoHelp,
      univmsg: state.showUnivMsg,
      summaryPreview: state.showSummaryPreview,
      editing: state.editIndex !== null,
      discard: state.showDiscard
    };
    var screenEnter = cur.screen !== prevSnapshot.screen ? 'screen-enter' : '';
    var kakaoEnter = cur.kakao && !prevSnapshot.kakao ? 'overlay-enter' : '';
    var univmsgEnter = cur.univmsg && !prevSnapshot.univmsg ? 'overlay-enter' : '';
    var summaryPreviewEnter = cur.summaryPreview && !prevSnapshot.summaryPreview ? 'overlay-enter' : '';
    var editEnter = cur.editing && !prevSnapshot.editing ? 'overlay-enter' : '';
    var discardEnter = cur.discard && !prevSnapshot.discard ? 'discard-enter' : '';

    var body = (SCREEN_RENDERERS[state.screen] || renderWelcome)(screenEnter);
    var html = '<div class="app-shell">' + body + renderCornerLogo() + renderWelcomeTeam() +
      renderKakaoHelp(kakaoEnter) + renderUnivMsg(univmsgEnter) + renderSummaryPreview(summaryPreviewEnter) + renderEditSheet(editEnter, discardEnter) +
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
      if (state.teamUnlocked) { go('summary'); loadSummaryData(); }
      else { update(function () { state.pinInput = ''; state.pinError = false; }); go('pin'); }
    },
    backToApp: function () { persistTeamSession(false); go('welcome'); },
    reloadSummary: loadSummaryData,
    pinCancel: function () { update(function () { state.pinInput = ''; state.pinError = false; }); go('welcome'); },
    pinPress: function (el) { pinPress(el.getAttribute('data-value')); },
    pinDel: pinDel,
    setViewToday: function () { update(function () { state.viewMode = 'today'; state.archiveMonth = null; state.archiveDate = null; state.summaryFilter = 'all'; state.searchQuery = ''; }); },
    setViewArchive: function () { update(function () { state.viewMode = 'archive'; state.summaryFilter = 'all'; state.searchQuery = ''; }); },
    clearSearch: function () { update(function () { state.searchQuery = ''; }); },
    pickMonth: function (el) { update(function () { state.archiveMonth = el.getAttribute('data-key'); state.archiveDate = null; }); },
    pickWeek: function (el) { update(function () { state.archiveDate = el.getAttribute('data-date'); state.summaryFilter = 'all'; }); },
    backToMonths: function () { update(function () { state.archiveMonth = null; state.archiveDate = null; }); },
    backToWeeks: function () { update(function () { state.archiveDate = null; state.summaryFilter = 'all'; }); },
    setFilterAll: function () { update(function () { state.summaryFilter = 'all'; }); },
    setFilterGeneral: function () { update(function () { state.summaryFilter = state.summaryFilter === 'general' ? 'all' : 'general'; }); },
    setFilterUniv: function () { update(function () { state.summaryFilter = state.summaryFilter === 'univ' ? 'all' : 'univ'; }); },
    startEdit: function (el) { startEdit(Number(el.getAttribute('data-index'))); },
    requestClose: requestClose,
    enterEditMode: function () { update(function () { state.editMode = 'edit'; }); },
    exitEditMode: function () { update(function () { state.editDraft = JSON.parse(state.editOriginal); state.editMode = 'view'; }); },
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
    openSummaryPreview: function () { update(function () { state.showSummaryPreview = true; }); },
    closeSummaryPreview: function () { update(function () { state.showSummaryPreview = false; }); },
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
      if (kind === 'summarypreview') return ACTIONS.closeSummaryPreview();
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
    var value = t.value;

    if (context === 'search') {
      // The list needs to update live as they type, but a full render()
      // would destroy/recreate this very <input> mid-keystroke and break
      // IME composition — same issue text fields had everywhere else.
      // Only re-render the two results subtrees, leaving the input alone.
      state.searchQuery = value;
      var statsEl = document.getElementById('summaryStats');
      if (statsEl) statsEl.innerHTML = renderSummaryStats();
      var resultsEl = document.getElementById('summaryResults');
      if (resultsEl) resultsEl.innerHTML = renderSummaryList();
      var clearBtn = document.getElementById('searchClearBtn');
      if (clearBtn) clearBtn.style.visibility = value ? 'visible' : 'hidden';
      return;
    }

    if (field === 'birth') {
      value = digitsToYmd(value);
      if (t.value !== value) t.value = value;
    }
    var target = context === 'editDraft' ? state.editDraft : state.form;
    target[field] = value;
    if (context === 'form' && state.errors[field]) {
      state.errors[field] = undefined;
      clearInlineError(context, field);
    }
    if (context === 'form') persistRegSession();
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
    if (context === 'form') persistRegSession();
  });

  if (hadTeamSession()) {
    state.teamUnlocked = true;
    state.screen = 'summary';
  } else {
    restoreRegSession();
  }
  render();
  // Arm the back-button trap immediately on a restored non-welcome
  // screen, so a physical back press works even before any other
  // interaction happens to trigger it.
  syncHistory();
  if (state.screen === 'summary') loadSummaryData();
})();
