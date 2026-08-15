# Google Sheets 스키마

> 4단계(Apps Script 연동)에서 이 시트의 탭 이름과 컬럼명을 그대로 코드에서 참조합니다. 여기 적힌 이름 그대로 만들어주세요.

## 준비 방법

1. [sheets.google.com](https://sheets.google.com)에서 새 스프레드시트 생성
2. 스프레드시트 이름: **주안 새가족 등록 DB**
3. 기본 탭(Sheet1) 이름을 **Newcomers**로 변경
4. 탭을 하나 더 추가하고 이름을 **DailySummary**로 변경
5. 각 탭의 1행(맨 위 줄)에 아래 헤더를 순서대로 붙여넣기 (첫 칸 A1부터)

> **2026-08-16 업데이트**: 원래 "대학목장은 저장 없이 공유만"(옵션 A) 원칙이었으나, 팀 요약 화면에서 대학목장 등록자도 상세정보를 볼 수 있어야 한다는 결정에 따라 폐기했습니다. 이제 대학목장도 `Newcomers`에 `group_type = 대학목장`으로 전체 저장됩니다 — 아래 표는 일반/대학목장 공통입니다.

---

## 탭 1: `Newcomers` (일반목장 + 대학목장 등록자, `group_type`으로 구분)

| 열 | 헤더명 | 채우는 주체 | 타입 / 형식 | 설명 |
|---|---|---|---|---|
| A | submitted_at | 자동 (Apps Script) | datetime | 서버가 받은 정확한 제출 시각 |
| B | registration_date | 자동 (Apps Script) | date (YYYY-MM-DD) | 시드니 현지 기준 등록일 |
| C | name | 앱 (새가족 입력) | text | 이름 |
| D | contact | 앱 | text | 연락처 |
| E | kakao_id | 앱 | text | 카카오톡 ID (선택 입력) |
| F | date_of_birth | 앱 | date | 생년월일 |
| G | introducer | 앱 | text | 인도자 (선택 입력) |
| H | visa_type | 앱 | text | 비자 종류 |
| I | job_or_major | 앱 | text | 전공 또는 직업 (선택 입력) |
| J | baptism_status | 앱 | text | 세례 / 유아세례 / 미세례 / 모름 |
| K | previous_church | 앱 | text | 이전 출석교회 (선택 입력) |
| L | previous_activity | 앱 | text | 이전 봉사부서 (선택 입력) |
| M | group_type | 자동 (Apps Script) | text | "일반목장" 또는 "대학목장" |
| N | registration_source | 자동 (Apps Script) | text | "QR" 고정값 (추후 팀원입력 구분 추가 가능) |
| O | follow_up_status | **팀원이 수기 관리** | text (드롭다운) | 미연락 / 연락완료 / 목장연결 / 정착완료 |
| P | assigned_member | **팀원이 수기 관리** | text | 담당자 이름 |
| Q | notes | **팀원이 수기 관리** | text | 메모 |

**1행에 그대로 붙여넣을 헤더 (탭으로 구분됨, A1부터):**

```
submitted_at	registration_date	name	contact	kakao_id	date_of_birth	introducer	visa_type	job_or_major	baptism_status	previous_church	previous_activity	group_type	registration_source	follow_up_status	assigned_member	notes
```

**O열(follow_up_status) 드롭다운 설정** (선택이지만 추천):
데이터 → 데이터 확인 → 범위: O2:O1000 → 조건: 항목 목록 → `미연락,연락완료,목장연결,정착완료`

---

## 탭 2: `DailySummary` (경량 보조 로그 — 이름·태어난해만)

> 팀 요약 화면은 이제 `Newcomers`를 직접 읽어옵니다 (일반/대학목장 모두 전체 정보 포함). 이 탭은 화면 조회에는 더 이상 쓰이지 않고, 제출 시각마다 이름+태어난해만 별도로 남겨두는 가벼운 보조 로그로만 유지됩니다.

| 열 | 헤더명 | 채우는 주체 | 타입 | 설명 |
|---|---|---|---|---|
| A | registration_date | 자동 (Apps Script) | date | 등록일 |
| B | group_type | 자동 (Apps Script) | text | "일반목장" 또는 "대학목장" |
| C | name | 자동 (Apps Script) | text | 이름 |
| D | birth_year | 자동 (Apps Script) | number | 태어난 해 (4자리) |
| E | created_at | 자동 (Apps Script) | datetime | 요약 레코드 생성 시각 |

**1행에 그대로 붙여넣을 헤더:**

```
registration_date	group_type	name	birth_year	created_at
```

> 연락처·비자·세례여부 등 상세 개인정보는 이 탭에 절대 들어가지 않습니다 — 팀 요약 화면에서 이름+태어난해만 보여주는 원칙과 1:1로 대응합니다.

---

## 다음 단계에서 필요한 것

시트를 만드신 후 아래 두 가지만 알려주시면 Apps Script 코드를 정확히 맞춰서 작성할 수 있습니다.

1. 스프레드시트 URL (또는 스프레드시트 ID — URL의 `/d/`와 `/edit` 사이 문자열)
2. 두 탭 이름을 위 그대로(`Newcomers`, `DailySummary`) 쓰셨는지 확인
