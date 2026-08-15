/**
 * 주안 새가족등록 — Google Apps Script backend.
 * Paste this whole file into the Apps Script project bound to the
 * "주안 새가족 등록 DB" spreadsheet (Extensions > Apps Script), then
 * deploy as a Web App. See backend/apps_script_setup.md for steps.
 */

var SPREADSHEET_ID = '1ddsa7WI80IDZT0YA1tSzhn1Ovw1NtLyuzHqAJK1uqwY';
var TIMEZONE = 'Australia/Sydney';

function doGet(e) {
  return jsonResponse({ ok: true, message: '주안 새가족등록 API is running' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'submitGeneral') return handleSubmitGeneral(body);
    if (body.action === 'submitUnivSummary') return handleSubmitUnivSummary(body);
    return jsonResponse({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// 일반목장 제출: Newcomers에 전체 정보 저장 + DailySummary에 이름/태어난해만 추가.
function handleSubmitGeneral(body) {
  if (!body.name || !String(body.name).trim()) return jsonResponse({ ok: false, error: 'name is required' });
  if (!body.contact || !String(body.contact).trim()) return jsonResponse({ ok: false, error: 'contact is required' });

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
    '', // follow_up_status — 팀원이 나중에 수기로 채움
    '', // assigned_member
    ''  // notes
  ]);

  appendDailySummary(registrationDate, '일반목장', body.name, birthYear(body.birth));
  return jsonResponse({ ok: true });
}

// 대학목장 제출: Newcomers에는 절대 저장하지 않는다 (옵션 A).
// DailySummary에도 이름 + 태어난 해만 남긴다. 연락처/비자/전공 등 상세 정보는
// 서버로 아예 전송하지 않는 것이 원칙 — 이 함수는 그 최소 정보만 받는다.
function handleSubmitUnivSummary(body) {
  if (!body.name || !String(body.name).trim()) return jsonResponse({ ok: false, error: 'name is required' });

  var registrationDate = todaySydney();
  appendDailySummary(registrationDate, '대학목장', body.name, birthYear(body.birth));
  return jsonResponse({ ok: true });
}

function appendDailySummary(registrationDate, groupType, name, birthYearValue) {
  getSheet('DailySummary').appendRow([registrationDate, groupType, name || '', birthYearValue || '', new Date()]);
}

function birthYear(birth) {
  if (!birth) return '';
  var m = String(birth).match(/^(\d{4})/);
  return m ? Number(m[1]) : '';
}

function todaySydney() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function getSheet(name) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
