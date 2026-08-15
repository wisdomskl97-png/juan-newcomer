/**
 * 주안 새가족등록 — Google Apps Script backend.
 * Paste this whole file into the Apps Script project bound to the
 * "주안 새가족 등록 DB" spreadsheet (Extensions > Apps Script), then
 * deploy as a Web App. See backend/apps_script_setup.md for steps.
 *
 * Both 일반목장 and 대학목장 submissions are now stored in full in
 * Newcomers, distinguished by the group_type column. (Earlier versions
 * kept 대학목장 out of Newcomers entirely — that's been dropped.)
 */

var SPREADSHEET_ID =
  '1ddsa7WI80IDZT0YA1tSzhn1Ovw1NtLyuzHqAJK1uqwY';
var TIMEZONE = 'Australia/Sydney';

// Keep in sync with CONFIG.teamPin in docs/script.js.
// This is a soft gate, not real access control.
var TEAM_PIN = '0691';

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

// 팀 요약 화면 조회: Newcomers 전체를 읽어 그룹별로
// 반환한다 (일반목장/대학목장 모두 전체 정보 포함).
function handleGetSummary() {
  var sheet = getSheet('Newcomers');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ ok: true, records: [] });
  }

  var numRows = lastRow - 1;
  var range = sheet.getRange(2, 1, numRows, 17);
  var values = range.getValues();

  var records = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = row[2];
    if (!name) continue;
    records.push({
      date: formatDateCell(row[1]), // registration_date
      group: row[12] || '일반목장', // group_type
      name: name,
      year: yearFromDateCell(row[5]), // date_of_birth
      info: {
        contact: normalizePhone(row[3]),
        kakao: row[4] || '',
        birth: formatDateCell(row[5]),
        leader: row[6] || '',
        visa: row[7] || '',
        major: row[8] || '',
        baptism: row[9] || '',
        prevChurch: row[10] || '',
        prevDept: row[11] || ''
      }
    });
  }
  return jsonResponse({ ok: true, records: records });
}

function formatDateCell(v) {
  // Sheets stores date-looking values as real Date cells (it
  // auto-converts on write). `instanceof Date` isn't reliable
  // here, so duck-type instead.
  var isDateLike = v && typeof v.getFullYear === 'function';
  if (isDateLike) {
    return Utilities.formatDate(
      v, TIMEZONE, 'yyyy-MM-dd'
    );
  }
  return String(v || '');
}

function yearFromDateCell(v) {
  var s = formatDateCell(v);
  var m = s.match(/^(\d{4})/);
  return m ? m[1] : '';
}

// Sheets may have auto-converted a leading-zero AU mobile
// number to a plain number, dropping the 0 (0412 345 678 ->
// 412345678). AU mobiles are always 10 digits, so if all
// we've got is 9 digits, the leading 0 was almost certainly
// stripped — restore it. Only affects OLD rows; new rows are
// written pre-formatted as text so this shouldn't recur.
function normalizePhone(v) {
  var s = String(v || '').trim();
  if (/^\d{9}$/.test(s)) return '0' + s;
  return s;
}

// A leading apostrophe is Sheets' own "treat this as text, don't
// auto-convert it to a number/date" marker (the same thing typing
// '0412345678 into a cell by hand does) — the apostrophe itself is
// never stored, only its effect on how the value is interpreted.
// Pre-setting the cell's number format didn't reliably stop the
// auto-conversion, so use this instead for anything that must keep
// a leading zero (phone numbers, some Kakao IDs).
function forceText(v) {
  var s = String(v || '');
  return s ? "'" + s : '';
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'submitGeneral') {
      return saveNewcomer(body, '일반목장');
    }
    if (body.action === 'submitUniv') {
      return saveNewcomer(body, '대학목장');
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

// 일반목장/대학목장 공통 저장: Newcomers에 전체 정보를
// 저장하고, DailySummary에는 이름/태어난해만 추가로
// 남긴다 (팀 요약 화면의 가벼운 보조 인덱스 용도).
function saveNewcomer(body, groupType) {
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
    forceText(body.contact),
    forceText(body.kakao),
    body.birth || '',
    body.leader || '',
    body.visa || '',
    body.job || '',
    body.baptism || '',
    body.prevChurch || '',
    body.prevDept || '',
    groupType,
    'QR',
    '', // follow_up_status
    '', // assigned_member
    ''  // notes
  ]);

  appendDailySummary(
    registrationDate,
    groupType,
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

// The date a registration is filed under: the upcoming (or
// current, if today already is one) Sunday on Sydney's
// calendar — not literally the day someone filled out the
// form. A Thursday/Friday/Saturday registration belongs to
// that week's Sunday service, same date the frontend groups
// "오늘" under.
function todaySydney() {
  var sydneyYmd = Utilities.formatDate(
    new Date(), TIMEZONE, 'yyyy-MM-dd'
  );
  var parts = sydneyYmd.split('-').map(Number);
  // Pure calendar-date arithmetic on a UTC scratch Date, so
  // this isn't affected by the script project's own default
  // timezone or by DST — Sydney's Y/M/D already came from
  // Utilities.formatDate above.
  var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  var dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() + ((7 - dow) % 7));
  var mm = String(d.getUTCMonth() + 1);
  var dd = String(d.getUTCDate());
  if (mm.length < 2) mm = '0' + mm;
  if (dd.length < 2) dd = '0' + dd;
  return d.getUTCFullYear() + '-' + mm + '-' + dd;
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
