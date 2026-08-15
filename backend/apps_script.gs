/**
 * 주안 새가족등록 — Google Apps Script backend.
 * Paste this whole file into the Apps Script project bound to the
 * "주안 새가족 등록 DB" spreadsheet (Extensions > Apps Script), then
 * deploy as a Web App. See backend/apps_script_setup.md for steps.
 */

var SPREADSHEET_ID =
  '1ddsa7WI80IDZT0YA1tSzhn1Ovw1NtLyuzHqAJK1uqwY';
var TIMEZONE = 'Australia/Sydney';

// Keep in sync with CONFIG.teamPin in docs/script.js.
// This is a soft gate, not real security — DailySummary
// only ever holds name + birth year anyway.
var TEAM_PIN = '0000';

function doGet(e) {
  var action = e.parameter && e.parameter.action;
  if (action === 'getSummary') {
    var pinOk = e.parameter.pin === TEAM_PIN;
    if (!pinOk) {
      return jsonResponse({
        ok: false,
        error: 'unauthorized'
      });
    }
    return handleGetSummary();
  }
  return jsonResponse({
    ok: true,
    message: '주안 새가족등록 API is running'
  });
}

// 팀 요약 화면 조회: DailySummary 탭을 읽어
// 이름 + 태어난해만 반환한다.
function handleGetSummary() {
  var sheet = getSheet('DailySummary');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ ok: true, records: [] });
  }

  var numRows = lastRow - 1;
  var range = sheet.getRange(2, 1, numRows, 4);
  var values = range.getValues();

  var records = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = row[2];
    if (!name) continue;
    records.push({
      date: formatDateCell(row[0]),
      group: row[1] || '일반목장',
      name: name,
      year: row[3] ? String(row[3]) : ''
    });
  }
  return jsonResponse({ ok: true, records: records });
}

function formatDateCell(v) {
  // Sheets stores registration_date as a real Date cell (it
  // auto-converts date-looking strings on write). `instanceof Date`
  // isn't reliable here, so duck-type instead.
  var isDateLike = v && typeof v.getFullYear === 'function';
  if (isDateLike) {
    return Utilities.formatDate(
      v, TIMEZONE, 'yyyy-MM-dd'
    );
  }
  return String(v || '');
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'submitGeneral') {
      return handleSubmitGeneral(body);
    }
    if (body.action === 'submitUnivSummary') {
      return handleSubmitUnivSummary(body);
    }
    return jsonResponse({
      ok: false,
      error: 'unknown action: ' + body.action
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err)
    });
  }
}

// 일반목장 제출: Newcomers에 전체 정보 저장 +
// DailySummary에 이름/태어난해만 추가.
function handleSubmitGeneral(body) {
  if (!body.name || !String(body.name).trim()) {
    return jsonResponse({
      ok: false,
      error: 'name is required'
    });
  }
  if (!body.contact || !String(body.contact).trim()) {
    return jsonResponse({
      ok: false,
      error: 'contact is required'
    });
  }

  var now = new Date();
  var registrationDate = todaySydney();

  getSheet('Newcomers').appendRow([
    now,
    registrationDate,
    body.name || '',
    body.contact || '',
    body.kakao || '',
    body.birth || '',
    body.leader || '',
    body.visa || '',
    body.job || '',
    body.baptism || '',
    body.prevChurch || '',
    body.prevDept || '',
    '일반목장',
    'QR',
    '', // follow_up_status
    '', // assigned_member
    ''  // notes
  ]);

  appendDailySummary(
    registrationDate,
    '일반목장',
    body.name,
    birthYear(body.birth)
  );
  return jsonResponse({ ok: true });
}

// 대학목장 제출: Newcomers에는 절대 저장하지 않는다
// (옵션 A). DailySummary에도 이름 + 태어난 해만
// 남긴다. 연락처/비자/전공 등 상세 정보는 서버로
// 아예 전송하지 않는 것이 원칙이라, 이 함수는
// 그 최소 정보만 받는다.
function handleSubmitUnivSummary(body) {
  if (!body.name || !String(body.name).trim()) {
    return jsonResponse({
      ok: false,
      error: 'name is required'
    });
  }

  var registrationDate = todaySydney();
  appendDailySummary(
    registrationDate,
    '대학목장',
    body.name,
    birthYear(body.birth)
  );
  return jsonResponse({ ok: true });
}

function appendDailySummary(
  registrationDate, groupType, name, birthYearValue
) {
  getSheet('DailySummary').appendRow([
    registrationDate,
    groupType,
    name || '',
    birthYearValue || '',
    new Date()
  ]);
}

function birthYear(birth) {
  if (!birth) return '';
  var m = String(birth).match(/^(\d{4})/);
  return m ? Number(m[1]) : '';
}

function todaySydney() {
  return Utilities.formatDate(
    new Date(), TIMEZONE, 'yyyy-MM-dd'
  );
}

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('시트를 찾을 수 없습니다: ' + name);
  }
  return sheet;
}

function jsonResponse(obj) {
  var text = JSON.stringify(obj);
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}
