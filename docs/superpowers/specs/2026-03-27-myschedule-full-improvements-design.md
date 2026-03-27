# MySchedule 전체 개선사항 설계 문서

**Date:** 2026-03-27
**Status:** Approved
**Priority:** NEIS API 연동 최우선, 이후 순차 구현

---

## 1. 개요

경기북과학고 1학년 학생 대상 MySchedule 앱의 전반적인 UX, 기능, 디자인, 보안 개선.
기존 Vanilla JS + Supabase + Vercel 스택을 유지하며 점진적으로 기능을 추가한다.

---

## 2. Phase 1 — NEIS API 연동 (최우선)

### 2.1 아키텍처

```
Browser → api/neis.js (Vercel Serverless) → NEIS Open API
```

- API 키 `NEIS_API_KEY=e5db69bb76264e79862b0527cfdd2db8`는 Vercel 환경변수에 저장 (브라우저 비노출)
- 학사일정: 24시간 캐시 (변경 빈도 낮음)
- 급식: 1시간 캐시

### 2.2 학교 정보

- 학교명: 경기북과학고등학교
- 시도교육청코드: J10 (경기도교육청)
- 표준학교코드: API로 자동 조회 (`/schoolInfo` 엔드포인트)

### 2.3 학사일정 (`/SchoolSchedule`)

- 매월 캘린더 렌더링 시 해당 월 학사일정 자동 로드
- 캘린더 날짜 셀에 노란색(`#F59E0B`) 점 표시
- 날짜 클릭 시 사이드패널에 학사일정 내용 표시 (기존 일정 목록 위에)
- 기존 class/personal/group 일정과 공존

### 2.4 급식 (`/mealServiceDietInfo`)

- 시간표에 아침(07:30) / 점심(12:30) / 저녁(18:30) 행 추가
- 각 행에 "🍚 급식" 인라인 버튼
- 클릭 시 당일 해당 끼니 메뉴 모달 표시
- 칼로리 정보 포함 (NEIS 데이터에 있을 경우)
- 급식 없는 날(주말, 방학)은 버튼 비활성화

### 2.5 Vercel API 엔드포인트

`api/neis.js` — 쿼리 파라미터:
- `?type=schedule&month=YYYYMM` → 학사일정
- `?type=meal&date=YYYYMMDD&mealCode=1|2|3` → 급식 (1=조식, 2=중식, 3=석식)

---

## 3. Phase 1 — 즉시 적용 개선사항

### 3.1 UX

**"오늘" 버튼**
- 캘린더 헤더 좌우 화살표 사이에 "오늘" 버튼 추가
- 클릭 시 현재 연월로 즉시 이동 + 오늘 날짜 선택

**토스트 알림**
- 일정 저장/삭제/수정 성공 시 우하단에 토스트 메시지 (2.5초 후 자동 소멸)
- 성공(초록), 에러(빨강), 정보(파랑) 3가지 타입

**모달 애니메이션**
- 모달 열릴 때: `opacity 0→1` + `translateY(16px→0)` (200ms ease-out)
- 모달 닫힐 때: 역방향 (150ms)
- 모달 외부 클릭 시 닫힘

**로딩 스켈레톤**
- 캘린더 초기 로드 시 회색 pulse 애니메이션 스켈레톤 표시
- 사이드패널 일정 로드 중 스켈레톤 3줄

**빈 상태 디자인**
- 날짜 미선택 시: 캘린더 아이콘 + "날짜를 클릭해 일정을 확인하세요" 텍스트
- 선택한 날짜에 일정 없을 시: "이 날은 일정이 없습니다" + 일정 추가 버튼

### 3.2 보안 수정

**어드민 링크 숨기기**
- `calendar.html`의 어드민 링크를 `is_admin=true`인 경우에만 렌더링
- JS로 동적 표시/숨김 처리

**XSS 방지**
- `innerHTML` 대신 `textContent` 또는 `createElement` 사용
- 모든 사용자 입력값 이스케이프 헬퍼 함수 추가: `escapeHtml(str)`

**API 에러 핸들링**
- Supabase 오류, NEIS API 오류, 네트워크 오류 모두 토스트로 안내
- "다시 시도해주세요" 버튼 제공

**비밀번호 정책**
- 최소 8자, 영문+숫자 조합 필수
- 설정 페이지 비밀번호 변경 시 강도 표시 바 (weak/medium/strong)

### 3.3 접근성

- 캘린더 날짜 셀에 `aria-label="N월 N일, 일정 N개"` 추가
- 모달에 `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 추가
- 탭 포커스 시 outline 제거하지 않음 (`:focus-visible` 활용)

---

## 4. Phase 2 — 핵심 기능 추가

### 4.1 D-Day 카운트다운

- 일정 추가 시 "D-Day 일정" 체크박스 옵션
- D-Day 일정은 캘린더 상단 배너에 표시: `"수학올림피아드 D-7"`
- 여러 개일 경우 가장 가까운 3개 표시
- D-Day 당일: "D-Day" 표시, 지난 경우: "D+N"

### 4.2 일정 중복 경고

- 시간 기반 일정 추가 시 같은 날짜+시간대 일정 존재하면 경고 모달
- "그래도 추가" / "취소" 선택 가능

### 4.3 실행 취소 (Undo)

- 일정 삭제 시 토스트에 "실행 취소" 버튼 (5초간 표시)
- 취소 클릭 시 DB에 다시 insert
- 5초 경과 시 완전 삭제

### 4.4 주간/일간 뷰

- 캘린더 우상단에 "월 | 주 | 일" 토글 버튼
- 주간 뷰: 7컬럼 시간표 형식 (09:00~22:00)
- 일간 뷰: 선택 날짜의 24시간 타임라인

### 4.5 다크 모드

- CSS 변수 기반 (`prefers-color-scheme` 자동 감지 + 수동 토글)
- 헤더에 🌙/☀️ 토글 버튼
- 사용자 설정 `localStorage`에 저장

---

## 5. Phase 3 — 고급 기능

### 5.1 대시보드 위젯

- 로그인 후 첫 화면에 오늘 일정 요약, 이번 주 주요 일정, D-Day 목록 표시
- 별도 대시보드 페이지 (`dashboard.html`) 또는 calendar.html 상단 섹션

### 5.2 댓글/메모

- DB 테이블 `schedule_comments` 추가
- 반 전체 일정에 학생들이 댓글 추가 가능
- 댓글 작성 시 일정 생성자에게 알림

### 5.3 출결/참석 확인

- 그룹 일정에 "참석/불참/미정" 응답 기능
- 일정 상세에서 참석 현황 집계 표시

### 5.4 어드민 고도화

- 활동 로그: `admin_logs` 테이블, 누가 언제 무엇을 했는지 기록
- 공지사항: `announcements` 테이블, 전교/반별 팝업
- 어드민 대시보드: 반별 학생 수, 이번 주 일정 수, 최근 가입자
- 일괄 작업: 학생 체크박스 선택 후 반 변경/삭제

---

## 6. 데이터 흐름

```
캘린더 월 변경
  ├─ fetchSchedules(month) → Supabase
  ├─ fetchNeisSchedule(month) → api/neis.js → NEIS API
  └─ renderCalendar()

날짜 클릭
  ├─ renderSidePanelSchedules(date)
  ├─ renderNeisScheduleForDate(date)
  └─ renderTimetable(date)
        └─ [아침/점심/저녁 행] → 급식 버튼 → fetchMeal(date, mealCode) → 모달
```

---

## 7. 파일 변경 계획

| 파일 | 변경 내용 |
|------|----------|
| `api/neis.js` | 신규: NEIS API 프록시 (학사일정 + 급식) |
| `calendar.js` | NEIS 학사일정 표시, 토스트, 오늘 버튼, XSS 수정, D-Day, 다크모드 |
| `timetable.js` | 급식 버튼 + 모달 추가 |
| `style.css` | 토스트, 스켈레톤, 애니메이션, 다크모드 변수, 빈 상태 |
| `calendar.html` | 어드민 링크 조건부 렌더링 |
| `supabase/migrations/` | D-Day 필드, 댓글 테이블, 어드민 로그 (Phase 2~3) |
