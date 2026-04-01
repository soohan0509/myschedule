# remotion-myschedule-guide 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.claude/skills/remotion-myschedule-guide/SKILL.md`을 작성하여, Claude가 스킬 로드 후 myschedule 앱 안내 영상용 Remotion 프로젝트를 완전히 스캐폴딩할 수 있게 한다.

**Architecture:** 스킬 파일 하나(SKILL.md)에 프로젝트 스캐폴딩 지시와 모든 파일 템플릿을 포함한다. Claude는 스킬 로드 후 사용자에게 경로를 물어보고, 지시에 따라 파일들을 작성한다.

**Tech Stack:** Remotion 4.x, React 18, TypeScript, `@remotion/media-utils`

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `~/.claude/skills/remotion-myschedule-guide/SKILL.md` | 스킬 본체 — 스캐폴딩 지시 + 모든 템플릿 |

스킬이 생성하는 파일들 (스킬 실행 시점에 사용자 지정 경로에 생성됨):

| 파일 | 역할 |
|------|------|
| `package.json` | Remotion 의존성 |
| `remotion.config.ts` | Remotion 설정 (fps, 해상도) |
| `tsconfig.json` | TypeScript 설정 |
| `src/constants.ts` | FPS, 색상, 타이밍 상수 |
| `src/Root.tsx` | registerRoot + 컴포지션 등록 |
| `src/compositions/FullGuide.tsx` | 전체 영상 조합 |
| `src/components/PhoneFrame.tsx` | 모바일 프레임 래퍼 |
| `src/components/ClickCursor.tsx` | 클릭 커서 애니메이션 |
| `src/components/TypeWriter.tsx` | 타이핑 효과 |
| `src/components/SlideTitle.tsx` | 슬라이드 제목 |
| `src/scenes/Intro.tsx` | 인트로 슬라이드 |
| `src/scenes/Login.tsx` | 로그인 UI 재현 |
| `src/scenes/CalendarView.tsx` | 월간/주간/일간 뷰 전환 |
| `src/scenes/ScheduleAdd.tsx` | 일정 추가 모달 |
| `src/scenes/ScheduleEdit.tsx` | 일정 수정/삭제 |
| `src/scenes/DDayPopup.tsx` | D-Day 팝업 |
| `src/scenes/ClassView.tsx` | 반별 탭 전환 |
| `src/scenes/Notifications.tsx` | 알림 드롭다운 |
| `src/scenes/Settings.tsx` | 설정 화면 |
| `src/scenes/PWAInstall.tsx` | PWA 설치 안내 |
| `src/scenes/Outro.tsx` | 아웃트로 슬라이드 |

---

## Task 1: 스킬 디렉토리 및 SKILL.md 뼈대 생성

**Files:**
- Create: `~/.claude/skills/remotion-myschedule-guide/SKILL.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p ~/.claude/skills/remotion-myschedule-guide
```

Expected: 에러 없이 완료

- [ ] **Step 2: SKILL.md 뼈대 작성**

`~/.claude/skills/remotion-myschedule-guide/SKILL.md`에 아래 내용 작성:

```markdown
---
name: remotion-myschedule-guide
description: Use when creating a Remotion video project to introduce or guide users through the myschedule app (경기북과학고 1학년 일정 관리 PWA). Scaffolds a complete project with 11 scenes covering login, calendar views, schedule management, D-Day popup, notifications, settings, and PWA installation.
---

# remotion-myschedule-guide

## Overview

이 스킬은 myschedule 앱(경기북과학고 1학년 일정 관리 PWA) 안내 영상용 Remotion 프로젝트를 완전히 스캐폴딩한다.

**영상 사양:**
- 총 길이: 240초 (4분), 30fps = 7200 프레임
- 해상도: 1080×1920 (세로형 모바일)
- 스타일: 혼합형 (인트로/아웃트로 슬라이드 + 기능 UI 재현)
- 대상: 처음 사용하는 1학년 학생

## 사용 방법

스킬 로드 후 반드시 이 순서를 따른다:

1. 사용자에게 프로젝트 생성 경로를 물어본다:
   > "Remotion 프로젝트를 어느 경로에 생성할까요? (예: /home/soohan/myschedule-intro)"

2. 경로 확인 후 아래 Task 순서대로 파일을 생성한다.

3. 완료 후 아래 명령어를 안내한다:
   ```bash
   cd {경로}
   npm install
   npx remotion preview
   ```

---

## Task A: 프로젝트 루트 파일

### package.json

```json
{
  "name": "myschedule-intro",
  "version": "1.0.0",
  "scripts": {
    "start": "npx remotion preview",
    "build": "npx remotion render src/index.ts FullGuide out/guide.mp4"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "remotion": "^4.0.0",
    "@remotion/media-utils": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

### remotion.config.ts

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "lib": ["dom", "es2017"],
    "jsx": "react",
    "module": "commonjs",
    "target": "es2017",
    "strict": true,
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

---

## Task B: src/constants.ts

```ts
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const COLORS = {
  primary: '#1a73e8',
  primaryDark: '#1557b0',
  background: '#f8f9fa',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#202124',
  textSecondary: '#5f6368',
  success: '#34a853',
  danger: '#ea4335',
};

// 장면별 시작 프레임 (초 × FPS)
export const SCENE_START = {
  intro: 0,          // 0s
  login: 10 * FPS,   // 10s = 300f
  calendarView: 35 * FPS, // 35s = 1050f
  scheduleAdd: 65 * FPS,  // 65s = 1950f
  scheduleEdit: 95 * FPS, // 95s = 2850f
  dDay: 115 * FPS,        // 115s = 3450f
  classView: 135 * FPS,   // 135s = 4050f
  notifications: 155 * FPS, // 155s = 4650f
  settings: 170 * FPS,    // 170s = 5100f
  pwaInstall: 185 * FPS,  // 185s = 5550f
  outro: 210 * FPS,       // 210s = 6300f
};

export const TOTAL_FRAMES = 240 * FPS; // 7200
```

---

## Task C: 공통 컴포넌트

### src/components/PhoneFrame.tsx

모바일 프레임 래퍼. 자식 컴포넌트를 실제 폰 모양 안에 표시한다.

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORS } from '../constants';

interface PhoneFrameProps {
  children: React.ReactNode;
  scale?: number;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children, scale = 1 }) => {
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: COLORS.background,
      }}
    >
      <div
        style={{
          width: 390 * scale,
          height: 844 * scale,
          borderRadius: 44 * scale,
          border: `8px solid #333`,
          overflow: 'hidden',
          position: 'relative',
          background: COLORS.card,
          boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
        }}
      >
        {/* 노치 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 120 * scale,
            height: 28 * scale,
            background: '#333',
            borderRadius: '0 0 16px 16px',
            zIndex: 10,
          }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
};
```

### src/components/ClickCursor.tsx

지정된 위치에서 클릭 애니메이션(ripple)을 표시한다.

```tsx
import React from 'react';
import { useCurrentFrame, interpolate, spring } from 'remotion';
import { FPS } from '../constants';

interface ClickCursorProps {
  x: number;
  y: number;
  startFrame: number;
}

export const ClickCursor: React.FC<ClickCursorProps> = ({ x, y, startFrame }) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame > 30) return null;

  const scale = spring({
    frame: localFrame,
    fps: FPS,
    config: { damping: 10, stiffness: 200 },
  });

  const opacity = interpolate(localFrame, [0, 20, 30], [1, 0.6, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x - 20,
        top: y - 20,
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'rgba(26, 115, 232, 0.4)',
        border: '3px solid #1a73e8',
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
```

### src/components/TypeWriter.tsx

텍스트를 타이핑 효과로 표시한다.

```tsx
import React from 'react';
import { useCurrentFrame } from 'remotion';

interface TypeWriterProps {
  text: string;
  startFrame: number;
  charsPerFrame?: number;
  style?: React.CSSProperties;
}

export const TypeWriter: React.FC<TypeWriterProps> = ({
  text,
  startFrame,
  charsPerFrame = 0.5,
  style,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  const charsToShow = Math.min(
    Math.floor(localFrame * charsPerFrame),
    text.length
  );
  return (
    <span style={style}>{text.slice(0, charsToShow)}</span>
  );
};
```

### src/components/SlideTitle.tsx

슬라이드 장면용 제목 컴포넌트. 아래에서 위로 페이드인.

```tsx
import React from 'react';
import { useCurrentFrame, interpolate, spring } from 'remotion';
import { FPS, COLORS } from '../constants';

interface SlideTitleProps {
  title: string;
  subtitle?: string;
  startFrame?: number;
}

export const SlideTitle: React.FC<SlideTitleProps> = ({
  title,
  subtitle,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  const y = interpolate(localFrame, [0, 20], [40, 0], {
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ transform: `translateY(${y}px)`, opacity }}>
      <h1
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: COLORS.text,
          margin: 0,
          textAlign: 'center',
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 40,
            color: COLORS.textSecondary,
            textAlign: 'center',
            marginTop: 16,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
```

---

## Task D: 장면 컴포넌트

### src/scenes/Intro.tsx (0-300f, 10s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';
import { SlideTitle } from '../components/SlideTitle';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();

  const bgOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const logoScale = interpolate(frame, [0, 25], [0.8, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.primary,
        opacity: bgOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      {/* 앱 아이콘 자리 */}
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: 36,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${logoScale})`,
          fontSize: 72,
        }}
      >
        📅
      </div>
      <SlideTitle
        title="경기북과학고 1학년"
        subtitle="일정 관리 앱 사용 안내"
        startFrame={10}
      />
    </AbsoluteFill>
  );
};
```

### src/scenes/Login.tsx (300-1050f, 10-35s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { TypeWriter } from '../components/TypeWriter';
import { COLORS } from '../constants';

export const Login: React.FC = () => {
  const frame = useCurrentFrame();

  // 반 선택 드롭다운은 50f에 클릭
  // 번호는 80f부터 타이핑
  // 비밀번호는 140f부터 타이핑
  // 로그인 버튼은 200f에 클릭

  const formOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <PhoneFrame scale={1.8}>
      <div
        style={{
          padding: '80px 32px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          opacity: formOpacity,
          background: COLORS.card,
          height: '100%',
        }}
      >
        <h2 style={{ textAlign: 'center', color: COLORS.primary, fontSize: 28 }}>
          로그인
        </h2>

        {/* 반 선택 */}
        <div style={fieldStyle}>
          <label style={labelStyle}>반</label>
          <select style={inputStyle}>
            <option>
              {frame >= 60 ? '1반' : '반 선택'}
            </option>
          </select>
        </div>

        {/* 번호 */}
        <div style={fieldStyle}>
          <label style={labelStyle}>출석 번호</label>
          <div style={inputStyle}>
            <TypeWriter text="15" startFrame={80} charsPerFrame={0.3} />
          </div>
        </div>

        {/* 비밀번호 */}
        <div style={fieldStyle}>
          <label style={labelStyle}>비밀번호</label>
          <div style={inputStyle}>
            <TypeWriter text="••••••••" startFrame={140} charsPerFrame={0.4} />
          </div>
        </div>

        {/* 로그인 버튼 */}
        <button
          style={{
            background: COLORS.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '16px',
            fontSize: 18,
            fontWeight: 600,
            cursor: 'pointer',
            transform: frame >= 200 && frame < 215 ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          로그인
        </button>
      </div>

      {/* 클릭 커서: 반 선택 */}
      <ClickCursor x={195} y={200} startFrame={50} />
      {/* 클릭 커서: 로그인 버튼 */}
      <ClickCursor x={195} y={420} startFrame={200} />
    </PhoneFrame>
  );
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#5f6368',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 16,
  background: '#f8f9fa',
  minHeight: 48,
};
```

### src/scenes/CalendarView.tsx (1050-1950f, 35-65s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { COLORS } from '../constants';

type ViewType = 'month' | 'week' | 'day';

export const CalendarView: React.FC = () => {
  const frame = useCurrentFrame();

  // 0-200f: 월간 뷰
  // 200-400f: 주간 뷰 (클릭 150f)
  // 400-600f: 일간 뷰 (클릭 350f)
  const view: ViewType =
    frame < 200 ? 'month' : frame < 400 ? 'week' : 'day';

  const slideX = interpolate(
    frame,
    [150, 200, 350, 400],
    [0, -390, -390, -780],
    { extrapolateRight: 'clamp' }
  );

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card, overflow: 'hidden' }}>
        {/* 헤더 */}
        <div
          style={{
            padding: '60px 16px 12px',
            background: COLORS.primary,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {view === 'month' ? '2026년 4월' : view === 'week' ? '4월 1주' : '4월 1일'}
          </span>
          {/* 뷰 전환 탭 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['month', 'week', 'day'] as ViewType[]).map((v) => (
              <span
                key={v}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: view === v ? 'rgba(255,255,255,0.3)' : 'transparent',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {v === 'month' ? '월' : v === 'week' ? '주' : '일'}
              </span>
            ))}
          </div>
        </div>

        {/* 캘린더 그리드 */}
        <div style={{ padding: 16 }}>
          {view === 'month' && <MonthGrid />}
          {view === 'week' && <WeekGrid />}
          {view === 'day' && <DayGrid />}
        </div>
      </div>

      <ClickCursor x={300} y={90} startFrame={150} />
      <ClickCursor x={350} y={90} startFrame={350} />
    </PhoneFrame>
  );
};

const MonthGrid: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
    {['일','월','화','수','목','금','토'].map(d => (
      <div key={d} style={{ textAlign: 'center', fontSize: 12, color: '#5f6368', padding: 4 }}>{d}</div>
    ))}
    {Array.from({ length: 30 }, (_, i) => (
      <div
        key={i}
        style={{
          textAlign: 'center',
          padding: '6px 4px',
          fontSize: 14,
          borderRadius: 20,
          background: i + 1 === 1 ? '#1a73e8' : 'transparent',
          color: i + 1 === 1 ? '#fff' : '#202124',
        }}
      >
        {i + 1}
      </div>
    ))}
  </div>
);

const WeekGrid: React.FC = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    {['일','월','화','수','목','금','토'].map((d, i) => (
      <div key={d} style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#5f6368' }}>{d}</div>
        <div style={{
          marginTop: 4,
          padding: '6px 0',
          borderRadius: 20,
          background: i === 3 ? '#1a73e8' : 'transparent',
          color: i === 3 ? '#fff' : '#202124',
          fontSize: 14,
        }}>
          {i + 1}
        </div>
      </div>
    ))}
  </div>
);

const DayGrid: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {['1교시 수학', '2교시 영어', '3교시 과학', '4교시 국어'].map((c, i) => (
      <div key={i} style={{
        padding: '10px 14px',
        background: '#e8f0fe',
        borderLeft: '4px solid #1a73e8',
        borderRadius: 6,
        fontSize: 14,
      }}>
        {c}
      </div>
    ))}
  </div>
);
```

### src/scenes/ScheduleAdd.tsx (1950-2850f, 65-95s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { TypeWriter } from '../components/TypeWriter';
import { COLORS, FPS } from '../constants';

export const ScheduleAdd: React.FC = () => {
  const frame = useCurrentFrame();

  // 50f: + 버튼 클릭 → 모달 열림
  const modalScale = spring({
    frame: frame - 50,
    fps: FPS,
    config: { damping: 15 },
  });
  const modalOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card, position: 'relative' }}>
        {/* 기본 캘린더 배경 */}
        <div style={{ padding: '60px 16px 12px', background: COLORS.primary, color: '#fff' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>2026년 4월</span>
        </div>

        {/* + 버튼 */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: COLORS.primary,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            boxShadow: '0 4px 12px rgba(26,115,232,0.4)',
          }}
        >
          +
        </div>

        {/* 일정 추가 모달 */}
        {frame >= 50 && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px',
              transform: `scaleY(${modalScale})`,
              transformOrigin: 'bottom',
              opacity: modalOpacity,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18 }}>일정 추가</h3>
            <div>
              <label style={{ fontSize: 13, color: '#5f6368' }}>제목</label>
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', marginTop: 4, minHeight: 40 }}>
                <TypeWriter text="1차 정기 시험" startFrame={120} charsPerFrame={0.4} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#5f6368' }}>날짜</label>
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', marginTop: 4, fontSize: 14 }}>
                {frame >= 180 ? '2026-04-20' : '날짜 선택'}
              </div>
            </div>
            <button
              style={{
                background: COLORS.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: 14,
                fontSize: 16,
                fontWeight: 600,
                transform: frame >= 240 && frame < 255 ? 'scale(0.97)' : 'scale(1)',
              }}
            >
              저장
            </button>
          </div>
        )}

        <ClickCursor x={330} y={590} startFrame={40} />
        <ClickCursor x={195} y={540} startFrame={240} />
      </div>
    </PhoneFrame>
  );
};
```

### src/scenes/ScheduleEdit.tsx (2850-3450f, 95-115s)

```tsx
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { COLORS } from '../constants';

export const ScheduleEdit: React.FC = () => {
  const frame = useCurrentFrame();

  // 50f: 일정 클릭 → 상세 팝업
  const popupOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card, position: 'relative', padding: '60px 16px 16px' }}>
        {/* 일정 카드 */}
        <div
          style={{
            padding: '14px 16px',
            background: '#e8f0fe',
            borderLeft: '4px solid #1a73e8',
            borderRadius: 8,
            fontSize: 15,
            marginTop: 12,
          }}
        >
          1차 정기 시험 (4/20)
        </div>

        {/* 상세 팝업 */}
        {frame >= 50 && (
          <div
            style={{
              position: 'absolute',
              top: 180,
              left: 20,
              right: 20,
              background: '#fff',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              opacity: popupOpacity,
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>1차 정기 시험</p>
            <p style={{ fontSize: 14, color: '#5f6368', margin: '0 0 20px' }}>2026년 4월 20일</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={{
                  flex: 1,
                  padding: 10,
                  background: COLORS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  transform: frame >= 150 && frame < 165 ? 'scale(0.97)' : 'scale(1)',
                }}
              >
                수정
              </button>
              <button
                style={{
                  flex: 1,
                  padding: 10,
                  background: '#ea4335',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                삭제
              </button>
            </div>
          </div>
        )}

        <ClickCursor x={195} y={145} startFrame={40} />
        <ClickCursor x={130} y={385} startFrame={150} />
      </div>
    </PhoneFrame>
  );
};
```

### src/scenes/DDayPopup.tsx (3450-4050f, 115-135s)

```tsx
import React from 'react';
import { useCurrentFrame, interpolate, spring } from 'remotion';
import { AbsoluteFill } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { COLORS, FPS } from '../constants';

export const DDayPopup: React.FC = () => {
  const frame = useCurrentFrame();

  const popupY = spring({
    frame,
    fps: FPS,
    config: { damping: 14, stiffness: 120 },
  });

  const translateY = interpolate(popupY, [0, 1], [300, 0]);

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card, position: 'relative' }}>
        <div style={{ padding: '60px 16px 12px', background: COLORS.primary, color: '#fff' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>2026년 4월</span>
        </div>

        {/* D-Day 팝업 오버레이 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: 24,
              width: '100%',
              transform: `translateY(${translateY}px)`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
              <h3 style={{ fontSize: 20, margin: '0 0 4px', color: COLORS.text }}>
                1차 정기 시험
              </h3>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: COLORS.primary,
                  margin: '8px 0',
                }}
              >
                D-19
              </div>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: 0 }}>
                2026년 4월 20일
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button
                style={{
                  padding: 12,
                  background: COLORS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  transform: frame >= 350 && frame < 365 ? 'scale(0.97)' : 'scale(1)',
                }}
              >
                확인
              </button>
              <button
                style={{
                  padding: 12,
                  background: '#f1f3f4',
                  color: COLORS.textSecondary,
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                }}
              >
                하루동안 보지 않기
              </button>
            </div>
          </div>
        </div>

        <ClickCursor x={195} y={480} startFrame={350} />
      </div>
    </PhoneFrame>
  );
};
```

### src/scenes/ClassView.tsx (4050-4650f, 135-155s)

```tsx
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { COLORS } from '../constants';

export const ClassView: React.FC = () => {
  const frame = useCurrentFrame();

  // 각 반 클릭 타이밍
  const activeClass =
    frame < 100 ? 1 :
    frame < 200 ? 2 :
    frame < 300 ? 3 :
    frame < 400 ? 4 : 5;

  const clickFrames = [90, 190, 290, 390];

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card }}>
        <div style={{ padding: '60px 0 0', background: COLORS.primary }}>
          {/* 반 탭 */}
          <div style={{ display: 'flex' }}>
            {[1, 2, 3, 4, 5].map((c) => (
              <div
                key={c}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  color: activeClass === c ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontWeight: activeClass === c ? 700 : 400,
                  borderBottom: activeClass === c ? '3px solid #fff' : '3px solid transparent',
                  fontSize: 15,
                }}
              >
                {c}반
              </div>
            ))}
          </div>
        </div>

        {/* 일정 목록 */}
        <div style={{ padding: '16px' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, margin: '0 0 12px' }}>
            {activeClass}반 일정
          </p>
          {[`${activeClass}반 수학 시험`, `${activeClass}반 과제 제출`, `${activeClass}반 체육 대회`].map((item, i) => (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                background: '#e8f0fe',
                borderLeft: '4px solid #1a73e8',
                borderRadius: 6,
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      {clickFrames.map((f, i) => (
        <ClickCursor key={i} x={(i + 1) * 70 + 10} y={125} startFrame={f} />
      ))}
    </PhoneFrame>
  );
};
```

### src/scenes/Notifications.tsx (4650-5100f, 155-170s)

```tsx
import React from 'react';
import { useCurrentFrame, interpolate, spring } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { COLORS, FPS } from '../constants';

export const Notifications: React.FC = () => {
  const frame = useCurrentFrame();

  // 50f: 알림 아이콘 클릭 → 드롭다운
  const dropdownHeight = spring({
    frame: frame - 50,
    fps: FPS,
    config: { damping: 14 },
  });
  const height = interpolate(dropdownHeight, [0, 1], [0, 280], {
    extrapolateRight: 'clamp',
  });

  const notifications = [
    { icon: '📅', text: '오늘 1차 시험까지 D-19입니다', time: '방금 전' },
    { icon: '📢', text: '새 공지: 4월 급식 변경 안내', time: '1시간 전' },
    { icon: '⏰', text: '내일 과제 제출 마감입니다', time: '3시간 전' },
  ];

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: COLORS.card, position: 'relative' }}>
        {/* 헤더 */}
        <div
          style={{
            padding: '60px 16px 12px',
            background: COLORS.primary,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 600 }}>일정</span>
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                background: '#ea4335',
                color: '#fff',
                borderRadius: '50%',
                width: 16,
                height: 16,
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              3
            </span>
          </div>
        </div>

        {/* 알림 드롭다운 */}
        {frame >= 50 && (
          <div
            style={{
              position: 'absolute',
              top: 110,
              right: 8,
              width: 300,
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              height,
            }}
          >
            {notifications.map((n, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderBottom: i < 2 ? '1px solid #f0f0f0' : 'none',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 20 }}>{n.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.text }}>{n.text}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: COLORS.textSecondary }}>{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <ClickCursor x={354} y={90} startFrame={40} />
      </div>
    </PhoneFrame>
  );
};
```

### src/scenes/Settings.tsx (5100-5550f, 170-185s)

```tsx
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { PhoneFrame } from '../components/PhoneFrame';
import { ClickCursor } from '../components/ClickCursor';
import { TypeWriter } from '../components/TypeWriter';
import { COLORS } from '../constants';

export const Settings: React.FC = () => {
  const frame = useCurrentFrame();

  const isDark = frame >= 250;

  const bg = isDark ? '#1e1e2e' : COLORS.card;
  const textColor = isDark ? '#e0e0e0' : COLORS.text;

  return (
    <PhoneFrame scale={1.8}>
      <div style={{ height: '100%', background: bg, transition: 'background 0.3s' }}>
        <div style={{ padding: '60px 16px 16px', background: isDark ? '#2d2d3f' : COLORS.primary, color: '#fff' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>설정</span>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 이름 변경 섹션 */}
          <div
            style={{
              background: isDark ? '#2d2d3f' : '#f8f9fa',
              borderRadius: 12,
              padding: '16px',
              marginBottom: 12,
            }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 14, color: isDark ? '#aaa' : '#5f6368' }}>이름 변경</p>
            <div
              style={{
                border: `1px solid ${isDark ? '#444' : '#e0e0e0'}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 15,
                background: isDark ? '#1e1e2e' : '#fff',
                color: textColor,
                minHeight: 40,
              }}
            >
              {frame >= 100 ? (
                <TypeWriter text="홍길동" startFrame={100} charsPerFrame={0.3} />
              ) : '김민준'}
            </div>
          </div>

          {/* 다크 모드 토글 */}
          <div
            style={{
              background: isDark ? '#2d2d3f' : '#f8f9fa',
              borderRadius: 12,
              padding: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 15, color: textColor }}>🌙 다크 모드</span>
            <div
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                background: isDark ? COLORS.primary : '#ccc',
                position: 'relative',
                transition: 'background 0.3s',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 3,
                  left: isDark ? 23 : 3,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.3s',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <ClickCursor x={340} y={310} startFrame={240} />
    </PhoneFrame>
  );
};
```

### src/scenes/PWAInstall.tsx (5550-6300f, 185-210s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';
import { SlideTitle } from '../components/SlideTitle';

export const PWAInstall: React.FC = () => {
  const frame = useCurrentFrame();

  const steps = [
    { icon: '🌐', title: 'Safari/Chrome 열기', desc: '모바일 브라우저에서 사이트 접속' },
    { icon: '📤', title: '공유 버튼 탭', desc: 'iOS: 하단 공유 아이콘 / Android: 메뉴 → ...' },
    { icon: '📱', title: '홈 화면에 추가', desc: '"홈 화면에 추가" 선택 후 추가' },
  ];

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e8f0fe 100%)',
        padding: '80px 60px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 48,
      }}
    >
      <SlideTitle title="앱 설치하기" subtitle="홈 화면에서 바로 접속!" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 800 }}>
        {steps.map((step, i) => {
          const opacity = interpolate(frame, [i * 40, i * 40 + 30], [0, 1], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          });
          const x = interpolate(frame, [i * 40, i * 40 + 30], [-40, 0], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                background: '#fff',
                borderRadius: 16,
                padding: '20px 24px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                opacity,
                transform: `translateX(${x}px)`,
              }}
            >
              <span style={{ fontSize: 48 }}>{step.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: COLORS.text }}>{step.title}</p>
                <p style={{ margin: '6px 0 0', fontSize: 18, color: COLORS.textSecondary }}>{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

### src/scenes/Outro.tsx (6300-7200f, 210-240s)

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const urlOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [800, 900], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        opacity: opacity * fadeOut,
      }}
    >
      <div style={{ fontSize: 80 }}>🎉</div>
      <h1 style={{ fontSize: 64, fontWeight: 700, color: '#fff', margin: 0, textAlign: 'center' }}>
        이제 시작해보세요!
      </h1>
      <p style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)', margin: 0, textAlign: 'center' }}>
        경기북과학고 1학년 일정 관리 앱
      </p>
      <div
        style={{
          marginTop: 16,
          padding: '16px 32px',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: 12,
          fontSize: 26,
          color: '#fff',
          opacity: urlOpacity,
          backdropFilter: 'blur(8px)',
        }}
      >
        🔗 사이트 URL
      </div>
    </AbsoluteFill>
  );
};
```

---

## Task E: Root.tsx 및 FullGuide.tsx

### src/Root.tsx

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { FullGuide } from './compositions/FullGuide';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './constants';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FullGuide"
        component={FullGuide}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
```

### src/index.ts (진입점)

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

### src/compositions/FullGuide.tsx

```tsx
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { SCENE_START, FPS } from '../constants';
import { Intro } from '../scenes/Intro';
import { Login } from '../scenes/Login';
import { CalendarView } from '../scenes/CalendarView';
import { ScheduleAdd } from '../scenes/ScheduleAdd';
import { ScheduleEdit } from '../scenes/ScheduleEdit';
import { DDayPopup } from '../scenes/DDayPopup';
import { ClassView } from '../scenes/ClassView';
import { Notifications } from '../scenes/Notifications';
import { Settings } from '../scenes/Settings';
import { PWAInstall } from '../scenes/PWAInstall';
import { Outro } from '../scenes/Outro';

const S = SCENE_START;

export const FullGuide: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={S.intro} durationInFrames={S.login - S.intro}>
        <Intro />
      </Sequence>
      <Sequence from={S.login} durationInFrames={S.calendarView - S.login}>
        <Login />
      </Sequence>
      <Sequence from={S.calendarView} durationInFrames={S.scheduleAdd - S.calendarView}>
        <CalendarView />
      </Sequence>
      <Sequence from={S.scheduleAdd} durationInFrames={S.scheduleEdit - S.scheduleAdd}>
        <ScheduleAdd />
      </Sequence>
      <Sequence from={S.scheduleEdit} durationInFrames={S.dDay - S.scheduleEdit}>
        <ScheduleEdit />
      </Sequence>
      <Sequence from={S.dDay} durationInFrames={S.classView - S.dDay}>
        <DDayPopup />
      </Sequence>
      <Sequence from={S.classView} durationInFrames={S.notifications - S.classView}>
        <ClassView />
      </Sequence>
      <Sequence from={S.notifications} durationInFrames={S.settings - S.notifications}>
        <Notifications />
      </Sequence>
      <Sequence from={S.settings} durationInFrames={S.pwaInstall - S.settings}>
        <Settings />
      </Sequence>
      <Sequence from={S.pwaInstall} durationInFrames={S.outro - S.pwaInstall}>
        <PWAInstall />
      </Sequence>
      <Sequence from={S.outro} durationInFrames={FPS * 30}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
```

---

## Task F: 스킬 파일 마무리 및 검증

- [ ] **Step 1: 실행 안내 섹션 추가**

SKILL.md 하단에 아래 내용 추가:

```markdown
## 실행 방법

모든 파일 생성 완료 후:

\`\`\`bash
cd {생성된 경로}
npm install
npx remotion preview
# 브라우저에서 http://localhost:3000 열림
\`\`\`

## 렌더링 (최종 MP4 출력)

\`\`\`bash
npx remotion render src/index.ts FullGuide out/guide.mp4
\`\`\`
```

- [ ] **Step 2: 스킬 파일 완성 확인**

```bash
wc -l ~/.claude/skills/remotion-myschedule-guide/SKILL.md
```

Expected: 600줄 이상 (모든 템플릿 포함)

- [ ] **Step 3: YAML 프론트매터 검증**

```bash
head -5 ~/.claude/skills/remotion-myschedule-guide/SKILL.md
```

Expected:
```
---
name: remotion-myschedule-guide
description: Use when creating a Remotion video project...
---
```

- [ ] **Step 4: 커밋**

```bash
cd /home/soohan/myschedule
git add docs/
git commit -m "docs: remotion-myschedule-guide 스킬 설계 및 구현 계획 추가"
```

---

## Self-Review

**스펙 커버리지 체크:**
- ✅ 스킬 파일 위치 (`~/.claude/skills/`)
- ✅ 11개 장면 모두 포함
- ✅ 공통 컴포넌트 4개 (PhoneFrame, ClickCursor, TypeWriter, SlideTitle)
- ✅ 실행 경로 사용자 지정
- ✅ package.json + remotion.config.ts + tsconfig.json
- ✅ constants.ts (색상, FPS, 타이밍)
- ✅ Root.tsx + FullGuide.tsx

**플레이스홀더 없음 확인:** 모든 컴포넌트에 실제 코드 포함 ✅

**타입 일관성:** `SCENE_START`, `FPS`, `COLORS` 모두 `constants.ts`에서 import ✅
