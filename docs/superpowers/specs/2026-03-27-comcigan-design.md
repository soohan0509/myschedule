# 컴시간 알리미 연동 설계

## 개요

NEIS API 기반 시간표 조회를 컴시간 알리미(comcigan-parser)로 대체한다.
경기북과학고등학교(컴시간 코드: 12045) 1학년 1~5반의 주간 시간표를 제공하며,
과목명과 선생님 이름을 `파이썬(김진)` 형식으로 표시한다.

## 아키텍처

```
브라우저
  └─ GET /api/comcigan?class=1&day=1
        └─ Vercel 서버리스 함수 (api/comcigan.js)
              └─ comcigan-parser → 컴시간학생.kr 파싱
                    └─ JSON 반환: { "1교시": { subject, teacher }, ... }
```

- `day` 파라미터: 0=월, 1=화, 2=수, 3=목, 4=금 (JS `getDay() - 1`)
- `class` 파라미터: 1~5

## 캐싱

서버리스 함수 인스턴스 메모리에 6시간 캐시. 컴시간 시간표는 주 단위로 바뀌므로 충분하다.
Cold start 시 자동 재파싱.

## 데이터 형식

### API 응답
```json
{
  "1교시": { "subject": "파이썬", "teacher": "김진" },
  "2교시": { "subject": "생명1", "teacher": "임수" }
}
```

### 렌더링 형식
- 과목 있음: `파이썬(김진)`
- 과목 없음 (빈 교시): `-`

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `api/comcigan.js` | 신규. 경기북과학고 시간표 파싱 서버리스 함수 |
| `package.json` | 신규. `comcigan-parser` 의존성 |
| `timetable.js` | `fetchTimetable()` 내부를 `/api/comcigan` 호출로 교체, `renderTimetable()` 표시 형식 수정 |
| `app.js` | `NEIS_API_KEY`, `NEIS_ATPT_CODE`, `NEIS_SCHOOL_CODE` export 제거 |
| `build.js` | NEIS 관련 env 변수 3개 제거 |

## 제거 대상

- NEIS API 호출 로직 (`fetchTimetable` 내 `open.neis.go.kr` fetch)
- `app.js`의 NEIS export
- `build.js`의 NEIS env 주입
- Vercel 환경변수: `NEIS_API_KEY`, `NEIS_ATPT_CODE`, `NEIS_SCHOOL_CODE`

## 학교 정보

- 학교명: 경기북과학고등학교
- 컴시간 코드: 12045
- 대상: 1학년 1~5반
