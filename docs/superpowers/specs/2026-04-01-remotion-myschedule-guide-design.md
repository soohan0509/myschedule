# Remotion myschedule 안내 영상 스킬 설계

**날짜:** 2026-04-01
**프로젝트:** myschedule (경기북과학고 1학년 일정 관리 PWA)

---

## 목적

`remotion-myschedule-guide` 스킬을 생성한다. Claude가 이 스킬을 로드하면 myschedule 앱의 전체 기능을 소개하는 Remotion 안내 영상 프로젝트를 스캐폴딩한다.

---

## 스킬 동작 방식

1. 사용자에게 프로젝트 생성 경로를 물어본다
2. 해당 경로에 Remotion 프로젝트를 생성한다
3. 아래 장면 구조에 맞는 컴포넌트 파일을 모두 작성한다
4. `npx remotion preview` 실행 방법을 안내한다

---

## 대상 시청자

처음 사용하는 경기북과학고 1학년 학생. 친근하고 쉬운 설명 위주.

---

## 영상 사양

- **총 길이:** 약 240초 (4분)
- **FPS:** 30
- **해상도:** 1080x1920 (세로형, 모바일 기준) 또는 1920x1080 선택 가능
- **스타일:** 혼합형 — 인트로/아웃트로 슬라이드 + 기능 설명 UI 재현

---

## 장면 구조

| # | 장면 | 시작(s) | 종료(s) | 스타일 | 내용 |
|---|------|---------|---------|--------|------|
| 1 | Intro | 0 | 10 | 슬라이드 | 앱 이름 + 학교명 페이드인 |
| 2 | Login | 10 | 35 | UI 재현 | 반/번호/비번 입력 → 로그인 버튼 클릭 |
| 3 | CalendarView | 35 | 65 | UI 재현 | 월간→주간→일간 뷰 전환 애니메이션 |
| 4 | ScheduleAdd | 65 | 95 | UI 재현 | 일정 추가 모달 열기 → 입력 → 저장 |
| 5 | ScheduleEdit | 95 | 115 | UI 재현 | 일정 클릭 → 수정/삭제 흐름 |
| 6 | DDayPopup | 115 | 135 | UI 재현 | 시험 D-Day 팝업 등장 + 하루동안 보지않기 |
| 7 | ClassView | 135 | 155 | UI 재현 | 1반~5반 탭 전환 |
| 8 | Notifications | 155 | 170 | UI 재현 | 알림 드롭다운 열기 |
| 9 | Settings | 170 | 185 | UI 재현 | 이름 변경, 다크모드 토글 |
| 10 | PWAInstall | 185 | 210 | 슬라이드 | 홈화면 추가 방법 (iOS/Android) |
| 11 | Outro | 210 | 240 | 슬라이드 | 마무리 메시지 + 사이트 URL |

---

## 생성될 파일 구조

```
{사용자지정경로}/
  package.json
  remotion.config.ts
  tsconfig.json
  src/
    Root.tsx                  # registerRoot() + 컴포지션 등록
    compositions/
      FullGuide.tsx           # 전체 영상: 모든 Sequence 조합
    scenes/
      Intro.tsx
      Login.tsx
      CalendarView.tsx
      ScheduleAdd.tsx
      ScheduleEdit.tsx
      DDayPopup.tsx
      ClassView.tsx
      Notifications.tsx
      Settings.tsx
      PWAInstall.tsx
      Outro.tsx
    components/
      PhoneFrame.tsx          # 모바일 프레임 래퍼
      ClickCursor.tsx         # 클릭 커서 애니메이션
      TypeWriter.tsx          # 타이핑 효과 컴포넌트
      SlideTitle.tsx          # 슬라이드 제목 컴포넌트
    constants.ts              # FPS, 색상(--primary #1a73e8), 타이밍 상수
```

---

## 핵심 기술 패턴

### 공통 상수 (constants.ts)
```ts
export const FPS = 30;
export const PRIMARY = '#1a73e8';
export const BG = '#f8f9fa';

// 장면별 시작 프레임
export const SCENES = {
  intro: 0,
  login: 10 * FPS,
  calendarView: 35 * FPS,
  // ...
};
```

### 슬라이드 장면 패턴
```tsx
const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
return <div style={{ opacity }}>...</div>;
```

### UI 재현 장면 패턴
```tsx
// PhoneFrame 안에 실제 앱 UI를 CSS로 재현
// spring()으로 모달 열림 애니메이션
const scale = spring({ frame, fps: FPS, config: { damping: 15 } });
```

### 클릭 커서
```tsx
// ClickCursor: 지정 위치에서 클릭 효과 (ripple)
<ClickCursor x={200} y={400} startFrame={50} />
```

---

## 앱 색상 시스템 (constants.ts에 포함)
```ts
export const COLORS = {
  primary: '#1a73e8',
  background: '#f8f9fa',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#202124',
  textSecondary: '#5f6368',
};
```

---

## 스킬 파일 위치

`~/.claude/skills/remotion-myschedule-guide/SKILL.md`

---

## 성공 기준

- Claude가 스킬 로드 후 경로를 물어보고 위 구조를 그대로 생성한다
- 각 씬 파일은 `npx remotion preview` 실행 시 에러 없이 렌더링된다
- 실제 앱의 색상/폰트/레이아웃을 최대한 재현한다
