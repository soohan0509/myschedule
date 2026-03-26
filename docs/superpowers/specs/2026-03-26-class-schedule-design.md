# 경기북과학고 1학년 반별 일정 공지 사이트 — 설계 스펙

**날짜**: 2026-03-26
**프로젝트**: myschedule
**대상**: 경기북과학고등학교 1학년 (1~5반)

---

## 1. 프로젝트 개요

반별 일정을 공유하고 관리하는 웹 사이트.
학생들이 직접 일정을 등록하고, 시간표 기반으로 확인할 수 있음.

---

## 2. 기술 스택

| 항목 | 선택 |
|------|------|
| Frontend | Vanilla HTML / CSS / JS |
| DB + Auth | Supabase |
| File Storage | Supabase Storage |
| 시간표 API | NEIS 교육정보 개방포털 API |
| 배포 | Vercel (정적 사이트) |

---

## 3. 파일 구조

```
myschedule/
├── index.html        # 로그인 / 회원가입
├── calendar.html     # 메인 캘린더
├── style.css         # 공통 스타일
├── app.js            # 인증 로직 (로그인/회원가입)
├── calendar.js       # 캘린더 + 일정 CRUD
├── timetable.js      # NEIS API 시간표 연동
└── .env              # Supabase URL/key + NEIS API 키 (gitignore)
```

---

## 4. 회원가입 / 로그인

**회원가입 입력 항목:**
- 이름 (실명)
- 반 (1~5반 드롭다운 선택)
- 번호 (출석 번호, 숫자)
- 비밀번호
- 비밀번호 확인

**로그인:** 이름 + 비밀번호 (또는 이메일 없이 Supabase Custom Auth)

---

## 5. 캘린더 화면

**상단 탭:** 1반 ~ 5반
- 내 반: 수정/삭제/추가 가능
- 다른 반: 읽기 전용

**날짜 클릭 시 표시:**
1. 해당 날짜의 시간표 (NEIS API, 반별)
2. 각 교시 클릭 → 일정 추가 모달
3. 맨 하단 "당일까지 제출" 섹션 → 별도 일정 추가

---

## 6. 일정 타입 3가지

| 타입 | 공개 범위 | 수정/삭제 |
|------|----------|----------|
| 반 전체 공유 | 같은 반 전체 | 같은 반 누구나 |
| 개인 | 본인만 | 본인만 |
| 그룹 | 초대 수락한 사람만 | 그룹 구성원 누구나 |

---

## 7. 그룹 일정 상세

- 일정 생성 시 같은 반 학생 목록에서 다중 선택
- 선택된 인원에게 알림 전송
- 알림: 오른쪽 상단 뱃지 → 클릭 시 수락/거절 선택
- **한 명이라도 거절하면 그룹 일정 전체 취소**

---

## 8. 첨부파일

- 파일 및 사진 첨부 가능
- Supabase Storage에 저장
- 일정 카드에서 다운로드 링크 제공

---

## 9. 데이터베이스 스키마

### profiles
```sql
id          uuid (FK → auth.users)
name        text        -- 실명
class_num   int         -- 반 (1~5)
seat_num    int         -- 출석 번호
created_at  timestamptz
```

### schedules
```sql
id           uuid
class_num    int         -- 어느 반 일정
date         date        -- 날짜
time_slot    text        -- 교시 또는 'submission' (당일제출)
title        text
detail       text
type         text        -- 'class' | 'personal' | 'group'
created_by   uuid (FK → profiles.id)
created_at   timestamptz
```

### attachments
```sql
id           uuid
schedule_id  uuid (FK → schedules.id)
file_url     text
file_name    text
```

### group_members
```sql
id           uuid
schedule_id  uuid (FK → schedules.id)
user_id      uuid (FK → profiles.id)
status       text  -- 'pending' | 'accepted' | 'rejected'
```

### notifications
```sql
id           uuid
user_id      uuid (FK → profiles.id)
schedule_id  uuid (FK → schedules.id)
type         text  -- 'group_invite'
is_read      bool
created_at   timestamptz
```

---

## 10. Row Level Security (Supabase)

| 테이블 | 읽기 | 쓰기 |
|--------|------|------|
| profiles | 같은 반 | 본인만 |
| schedules (class) | 전체 | 같은 반 |
| schedules (personal) | 본인만 | 본인만 |
| schedules (group) | group_members에 accepted인 사람 | 그룹 구성원 |
| attachments | schedule 읽기 권한과 동일 | schedule 쓰기 권한과 동일 |
| group_members | 본인 row | 생성자 + 본인 |
| notifications | 본인만 | 시스템 |

---

## 11. NEIS API

- 엔드포인트: `https://open.neis.go.kr/hub/hisTimetable`
- 학교: 경기북과학고등학교
- 교육청 코드: J10 (경기도)
- 필요 파라미터: `AY`(학년도), `SEM`(학기), `ALL_TI_YMD`(날짜), `GRADE`(1), `CLASS_NM`(반)
- API 키: `.env`에서 로드

---

## 12. 환경변수 (.env)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
NEIS_API_KEY=e5db69bb76264e79862b0527cfdd2db8
NEIS_SCHOOL_CODE=   # 학교 코드 (구현 시 확인 필요)
```
