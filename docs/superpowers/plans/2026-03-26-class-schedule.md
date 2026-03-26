# 경기북과학고 반별 일정 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기북과학고 1학년 1~5반 학생들이 반별 일정을 등록·공유하고, NEIS 시간표 기반으로 확인할 수 있는 웹사이트를 로컬에서 작동하도록 구축한다.

**Architecture:** Vanilla HTML/CSS/JS + Supabase(Auth/DB/Storage) + NEIS API. 빌드 과정 없이 Vercel 정적 배포. Supabase RLS로 반별 권한 제어.

**Tech Stack:** HTML5, CSS3, Vanilla JS (ES Modules), Supabase JS SDK v2, NEIS 교육정보 개방포털 API, Vercel

**Spec:** `docs/superpowers/specs/2026-03-26-class-schedule-design.md`

---

## 파일 구조

```
myschedule/
├── index.html          # 로그인/회원가입 페이지
├── calendar.html       # 메인 캘린더 페이지
├── style.css           # 공통 스타일 (로그인 + 캘린더)
├── app.js              # Supabase 초기화 + 인증 로직
├── calendar.js         # 캘린더 렌더링 + 일정 CRUD
├── timetable.js        # NEIS API 시간표 fetch + 렌더링
├── .env                # 환경변수 (gitignore)
├── .gitignore
└── supabase/
    └── migrations/
        └── 001_init.sql   # 테이블 + RLS 생성 SQL
```

---

### Task 1: 프로젝트 초기 설정

**Files:**
- Create: `.gitignore`
- Create: `.env`
- Create: `supabase/migrations/001_init.sql`

- [ ] **Step 1: .gitignore 생성**

```
.env
node_modules/
.DS_Store
```

- [ ] **Step 2: .env 생성**

```
SUPABASE_URL=여기에_입력
SUPABASE_ANON_KEY=여기에_입력
NEIS_API_KEY=e5db69bb76264e79862b0527cfdd2db8
NEIS_ATPT_CODE=J10
NEIS_SCHOOL_CODE=여기에_입력
```

> NEIS_SCHOOL_CODE 찾는 법:
> `https://open.neis.go.kr/hub/schoolInfo?KEY={NEIS_API_KEY}&Type=json&SCHUL_NM=경기북과학고등학교`
> 응답에서 `SD_SCHUL_CODE` 값 복사

- [ ] **Step 3: Supabase 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/001_init.sql

-- 프로필
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  class_num int not null check (class_num between 1 and 5),
  seat_num int not null,
  created_at timestamptz default now()
);

-- 일정
create table schedules (
  id uuid primary key default gen_random_uuid(),
  class_num int not null,
  date date not null,
  time_slot text not null,  -- '1교시'~'N교시' 또는 'submission'
  title text not null,
  detail text,
  type text not null check (type in ('class', 'personal', 'group')),
  created_by uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- 첨부파일
create table attachments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  file_url text not null,
  file_name text not null
);

-- 그룹 멤버
create table group_members (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected'))
);

-- 알림
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete cascade,
  type text not null default 'group_invite',
  is_read bool default false,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table profiles enable row level security;
alter table schedules enable row level security;
alter table attachments enable row level security;
alter table group_members enable row level security;
alter table notifications enable row level security;

-- profiles RLS
create policy "같은 반 읽기" on profiles for select
  using (class_num = (select class_num from profiles where id = auth.uid()));
create policy "본인 수정" on profiles for all
  using (id = auth.uid());

-- schedules RLS: class 타입
create policy "class 일정 전체 읽기" on schedules for select
  using (type = 'class');
create policy "class 일정 같은 반 쓰기" on schedules for insert
  with check (
    type = 'class' and
    class_num = (select class_num from profiles where id = auth.uid())
  );
create policy "class 일정 같은 반 수정삭제" on schedules for update
  using (
    type = 'class' and
    class_num = (select class_num from profiles where id = auth.uid())
  );
create policy "class 일정 같은 반 삭제" on schedules for delete
  using (
    type = 'class' and
    class_num = (select class_num from profiles where id = auth.uid())
  );

-- schedules RLS: personal 타입
create policy "personal 일정 본인만" on schedules for all
  using (type = 'personal' and created_by = auth.uid());

-- schedules RLS: group 타입
create policy "group 일정 멤버 읽기" on schedules for select
  using (
    type = 'group' and (
      created_by = auth.uid() or
      exists (
        select 1 from group_members
        where schedule_id = schedules.id
          and user_id = auth.uid()
          and status = 'accepted'
      )
    )
  );
create policy "group 일정 생성자 쓰기" on schedules for insert
  with check (type = 'group' and created_by = auth.uid());
create policy "group 일정 멤버 수정삭제" on schedules for update
  using (
    type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    )
  );
create policy "group 일정 멤버 삭제" on schedules for delete
  using (
    type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    )
  );

-- attachments RLS (schedule 권한 따라감)
create policy "attachments 읽기" on attachments for select using (true);
create policy "attachments 쓰기" on attachments for insert with check (true);
create policy "attachments 삭제" on attachments for delete using (true);

-- group_members RLS
create policy "group_members 읽기" on group_members for select
  using (user_id = auth.uid() or
    exists (select 1 from schedules where id = group_members.schedule_id and created_by = auth.uid()));
create policy "group_members 생성" on group_members for insert
  with check (
    exists (select 1 from schedules where id = group_members.schedule_id and created_by = auth.uid())
  );
create policy "group_members 본인 수정" on group_members for update
  using (user_id = auth.uid());

-- notifications RLS
create policy "notifications 본인 읽기" on notifications for select
  using (user_id = auth.uid());
create policy "notifications 본인 수정" on notifications for update
  using (user_id = auth.uid());
create policy "notifications 삽입" on notifications for insert with check (true);
```

- [ ] **Step 4: Supabase Storage 버킷 생성 (대시보드 또는 CLI)**

Supabase 대시보드 → Storage → New Bucket:
- Name: `attachments`
- Public: false

- [ ] **Step 5: DB 마이그레이션 적용**

```bash
cd ~/myschedule
supabase link --project-ref [프로젝트 ref ID]
supabase db push
```

- [ ] **Step 6: git 초기화 및 첫 커밋**

```bash
cd ~/myschedule
git init
git add .gitignore supabase/ docs/
git commit -m "chore: project setup with supabase migrations"
```

---

### Task 2: 공통 스타일 + Supabase 초기화

**Files:**
- Create: `style.css`
- Create: `app.js`

- [ ] **Step 1: style.css 작성 (로그인 + 캘린더 공통)**

```css
/* style.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary: #3B82F6;
  --primary-dark: #1D4ED8;
  --bg: #F8FAFC;
  --card: #FFFFFF;
  --border: #E2E8F0;
  --text: #1E293B;
  --text-muted: #64748B;
  --danger: #EF4444;
  --success: #22C55E;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
}

body { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; background: var(--bg); color: var(--text); }

/* 로그인 */
.auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.auth-card { background: var(--card); border-radius: 16px; padding: 40px; width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
.auth-card h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; }
.auth-card .subtitle { color: var(--text-muted); margin-bottom: 28px; font-size: 0.9rem; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; }
.form-group input, .form-group select {
  width: 100%; padding: 10px 14px; border: 1px solid var(--border);
  border-radius: 8px; font-size: 0.95rem; outline: none; transition: border 0.2s;
}
.form-group input:focus, .form-group select:focus { border-color: var(--primary); }
.btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.auth-toggle { text-align: center; margin-top: 16px; font-size: 0.85rem; color: var(--text-muted); }
.auth-toggle a { color: var(--primary); cursor: pointer; text-decoration: none; font-weight: 600; }
.error-msg { color: var(--danger); font-size: 0.85rem; margin-top: 8px; display: none; }
.error-msg.show { display: block; }

/* 캘린더 레이아웃 */
.app-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.app-header h1 { font-size: 1.1rem; font-weight: 700; }
.header-right { display: flex; align-items: center; gap: 16px; }
.user-info { font-size: 0.85rem; color: var(--text-muted); }
.btn-sm { padding: 6px 14px; font-size: 0.8rem; width: auto; }
.notification-btn { position: relative; background: none; border: none; cursor: pointer; font-size: 1.2rem; }
.notif-badge { position: absolute; top: -4px; right: -4px; background: var(--danger); color: white; border-radius: 50%; width: 16px; height: 16px; font-size: 0.65rem; display: flex; align-items: center; justify-content: center; display: none; }
.notif-badge.show { display: flex; }

/* 반 탭 */
.class-tabs { display: flex; gap: 4px; padding: 16px 24px 0; background: var(--card); border-bottom: 1px solid var(--border); }
.tab { padding: 10px 20px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); border: 1px solid transparent; border-bottom: none; }
.tab.active { background: var(--bg); color: var(--primary); border-color: var(--border); }
.tab.my-class { font-weight: 700; }

/* 캘린더 */
.main-content { display: flex; gap: 24px; padding: 24px; max-width: 1200px; margin: 0 auto; }
.calendar-section { flex: 1; }
.calendar-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.calendar-nav h2 { font-size: 1.2rem; font-weight: 700; }
.nav-btn { background: none; border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border-radius: 12px; overflow: hidden; }
.calendar-day-header { background: var(--card); padding: 8px; text-align: center; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
.calendar-day { background: var(--card); min-height: 80px; padding: 8px; cursor: pointer; transition: background 0.15s; }
.calendar-day:hover { background: #EFF6FF; }
.calendar-day.today { background: #EFF6FF; }
.calendar-day.selected { background: #DBEAFE; }
.calendar-day.other-month { opacity: 0.4; }
.day-num { font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
.day-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); display: inline-block; margin: 1px; }

/* 날짜 상세 패널 */
.detail-panel { width: 360px; flex-shrink: 0; }
.detail-card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: var(--shadow); }
.detail-card h3 { font-size: 1rem; font-weight: 700; margin-bottom: 16px; }
.timetable-list { list-style: none; }
.timetable-slot { padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; border: 1px solid var(--border); transition: background 0.15s; }
.timetable-slot:hover { background: #EFF6FF; border-color: var(--primary); }
.slot-label { font-size: 0.8rem; color: var(--text-muted); }
.slot-subject { font-size: 0.95rem; font-weight: 600; }
.slot-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; margin-left: 6px; }
.badge-class { background: #DBEAFE; color: #1D4ED8; }
.badge-personal { background: #F0FDF4; color: #166534; }
.badge-group { background: #FEF3C7; color: #92400E; }
.submission-section { margin-top: 12px; padding: 12px; background: #FFF7ED; border-radius: 8px; border: 1px solid #FED7AA; }
.submission-section h4 { font-size: 0.85rem; font-weight: 600; color: #92400E; margin-bottom: 8px; }

/* 일정 모달 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; display: none; }
.modal-overlay.open { display: flex; }
.modal { background: var(--card); border-radius: 16px; padding: 28px; width: 440px; max-width: 95vw; }
.modal h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; }
.type-selector { display: flex; gap: 8px; margin-bottom: 16px; }
.type-btn { flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600; text-align: center; background: var(--bg); }
.type-btn.active { border-color: var(--primary); background: #EFF6FF; color: var(--primary); }
.member-list { max-height: 160px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px; margin-bottom: 12px; }
.member-item { display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 6px; font-size: 0.9rem; }
.member-item:hover { background: var(--bg); }
.file-input-area { border: 2px dashed var(--border); border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; font-size: 0.85rem; color: var(--text-muted); }
.modal-actions { display: flex; gap: 8px; margin-top: 20px; }
.btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }

/* 알림 드롭다운 */
.notif-dropdown { position: absolute; top: 60px; right: 24px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200; display: none; }
.notif-dropdown.open { display: block; }
.notif-item { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.notif-item:last-child { border-bottom: none; }
.notif-text { font-size: 0.85rem; margin-bottom: 8px; }
.notif-actions { display: flex; gap: 8px; }
.btn-accept { background: var(--success); color: white; padding: 5px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn-reject { background: var(--danger); color: white; padding: 5px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
```

- [ ] **Step 2: app.js 작성 (Supabase 초기화 + 인증)**

```javascript
// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || window.__ENV?.SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__ENV?.SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}
```

> **참고:** Vanilla HTML에서 환경변수를 직접 읽을 수 없으므로 `env.js` 파일로 주입하거나, Vercel 배포 시 환경변수 처리. 로컬 개발 시 `env.js`에 직접 입력.

- [ ] **Step 3: env.js 생성 (로컬 개발용, gitignore에 추가)**

```javascript
// env.js (gitignore에 추가)
window.__ENV = {
  SUPABASE_URL: '.env에서 복사',
  SUPABASE_ANON_KEY: '.env에서 복사',
  NEIS_API_KEY: 'e5db69bb76264e79862b0527cfdd2db8',
  NEIS_ATPT_CODE: 'J10',
  NEIS_SCHOOL_CODE: '.env에서 복사'
};
```

.gitignore에 `env.js` 추가.

- [ ] **Step 4: app.js 환경변수 참조 방식 수정**

```javascript
// app.js 상단 수정
const SUPABASE_URL = window.__ENV?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__ENV?.SUPABASE_ANON_KEY;
export const NEIS_API_KEY = window.__ENV?.NEIS_API_KEY;
export const NEIS_ATPT_CODE = window.__ENV?.NEIS_ATPT_CODE;
export const NEIS_SCHOOL_CODE = window.__ENV?.NEIS_SCHOOL_CODE;
```

- [ ] **Step 5: commit**

```bash
git add style.css app.js
git commit -m "feat: common styles and supabase client initialization"
```

---

### Task 3: 로그인 / 회원가입 페이지

**Files:**
- Create: `index.html`

- [ ] **Step 1: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>경기북과학고 1학년 일정</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <script src="env.js"></script>
  <div class="auth-container">
    <div class="auth-card">
      <h1>경기북과학고 1학년</h1>
      <p class="subtitle" id="auth-subtitle">로그인하여 반 일정을 확인하세요</p>

      <!-- 로그인 폼 -->
      <form id="login-form">
        <div class="form-group">
          <label>이름</label>
          <input type="text" id="login-name" placeholder="실명 입력" required>
        </div>
        <div class="form-group">
          <label>비밀번호</label>
          <input type="password" id="login-password" required>
        </div>
        <p class="error-msg" id="login-error"></p>
        <button type="submit" class="btn btn-primary">로그인</button>
      </form>

      <!-- 회원가입 폼 (기본 숨김) -->
      <form id="signup-form" style="display:none">
        <div class="form-group">
          <label>이름 (실명)</label>
          <input type="text" id="signup-name" placeholder="홍길동" required>
        </div>
        <div class="form-group">
          <label>반</label>
          <select id="signup-class">
            <option value="">반 선택</option>
            <option value="1">1반</option>
            <option value="2">2반</option>
            <option value="3">3반</option>
            <option value="4">4반</option>
            <option value="5">5반</option>
          </select>
        </div>
        <div class="form-group">
          <label>번호</label>
          <input type="number" id="signup-seat" placeholder="출석 번호" min="1" max="40" required>
        </div>
        <div class="form-group">
          <label>비밀번호</label>
          <input type="password" id="signup-password" required>
        </div>
        <div class="form-group">
          <label>비밀번호 확인</label>
          <input type="password" id="signup-password-confirm" required>
        </div>
        <p class="error-msg" id="signup-error"></p>
        <button type="submit" class="btn btn-primary">회원가입</button>
      </form>

      <div class="auth-toggle">
        <span id="toggle-text">계정이 없으신가요?</span>
        <a id="toggle-btn"> 회원가입</a>
      </div>
    </div>
  </div>

  <script type="module">
    import { supabase } from './app.js';

    // 이미 로그인된 경우 캘린더로 이동
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = 'calendar.html';
    });

    let isLogin = true;

    document.getElementById('toggle-btn').addEventListener('click', () => {
      isLogin = !isLogin;
      document.getElementById('login-form').style.display = isLogin ? '' : 'none';
      document.getElementById('signup-form').style.display = isLogin ? 'none' : '';
      document.getElementById('auth-subtitle').textContent = isLogin ? '로그인하여 반 일정을 확인하세요' : '계정을 만들어 시작하세요';
      document.getElementById('toggle-text').textContent = isLogin ? '계정이 없으신가요?' : '이미 계정이 있으신가요?';
      document.getElementById('toggle-btn').textContent = isLogin ? ' 회원가입' : ' 로그인';
    });

    // 로그인: 이름을 이메일처럼 사용 (name@gyeongbuk.local)
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('login-name').value.trim();
      const password = document.getElementById('login-password').value;
      const email = name + '@gyeongbuk.local';
      const errEl = document.getElementById('login-error');

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        errEl.textContent = '이름 또는 비밀번호가 올바르지 않습니다.';
        errEl.classList.add('show');
      } else {
        window.location.href = 'calendar.html';
      }
    });

    // 회원가입
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const classNum = parseInt(document.getElementById('signup-class').value);
      const seatNum = parseInt(document.getElementById('signup-seat').value);
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-password-confirm').value;
      const errEl = document.getElementById('signup-error');

      if (!classNum) { errEl.textContent = '반을 선택해주세요.'; errEl.classList.add('show'); return; }
      if (password !== confirm) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; errEl.classList.add('show'); return; }
      if (password.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; errEl.classList.add('show'); return; }

      const email = name + '@gyeongbuk.local';
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { errEl.textContent = '이미 가입된 이름이거나 오류가 발생했습니다.'; errEl.classList.add('show'); return; }

      // profiles 테이블에 저장
      await supabase.from('profiles').insert({ id: data.user.id, name, class_num: classNum, seat_num: seatNum });
      window.location.href = 'calendar.html';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 로컬 확인**

```bash
cd ~/myschedule
python3 -m http.server 8080
# 또는
npx serve .
```

`http://localhost:8080`에서 로그인/회원가입 전환, 에러 메시지, 비밀번호 확인 동작 확인.

- [ ] **Step 3: commit**

```bash
git add index.html
git commit -m "feat: login and signup page"
```

---

### Task 4: NEIS 시간표 연동

**Files:**
- Create: `timetable.js`

- [ ] **Step 1: timetable.js 작성**

```javascript
// timetable.js
import { NEIS_API_KEY, NEIS_ATPT_CODE, NEIS_SCHOOL_CODE } from './app.js';

export async function fetchTimetable(classNum, date) {
  const dateStr = date.replace(/-/g, ''); // YYYYMMDD
  const url = `https://open.neis.go.kr/hub/hisTimetable?KEY=${NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${NEIS_ATPT_CODE}&SD_SCHUL_CODE=${NEIS_SCHOOL_CODE}&AY=${date.slice(0,4)}&SEM=1&ALL_TI_YMD=${dateStr}&GRADE=1&CLASS_NM=${classNum}`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    const rows = json?.hisTimetable?.[1]?.row;
    if (!rows) return [];
    return rows.map(r => ({
      period: r.PERIO,      // 교시 번호
      subject: r.ITRT_CNTNT // 과목명
    }));
  } catch {
    return [];
  }
}

export function renderTimetable(slots, schedules, classNum, date, myClassNum, onSlotClick) {
  const ul = document.createElement('ul');
  ul.className = 'timetable-list';

  slots.forEach(slot => {
    const li = document.createElement('li');
    li.className = 'timetable-slot';

    const slotSchedules = schedules.filter(s =>
      s.date === date && s.time_slot === slot.period + '교시' && s.class_num === classNum
    );

    const badgeHtml = slotSchedules.map(s =>
      `<span class="slot-badge badge-${s.type}">${s.title}</span>`
    ).join('');

    li.innerHTML = `
      <div class="slot-label">${slot.period}교시</div>
      <div class="slot-subject">${slot.subject}${badgeHtml}</div>
    `;

    if (classNum === myClassNum) {
      li.addEventListener('click', () => onSlotClick(slot.period + '교시'));
    }
    ul.appendChild(li);
  });

  // 당일까지 제출 섹션
  const subSection = document.createElement('div');
  subSection.className = 'submission-section';
  const subSchedules = schedules.filter(s =>
    s.date === date && s.time_slot === 'submission' && s.class_num === classNum
  );
  const subBadges = subSchedules.map(s =>
    `<span class="slot-badge badge-${s.type}">${s.title}</span>`
  ).join('');

  subSection.innerHTML = `
    <h4>📌 당일까지 제출 ${subBadges}</h4>
  `;
  if (classNum === myClassNum) {
    subSection.style.cursor = 'pointer';
    subSection.addEventListener('click', () => onSlotClick('submission'));
  }

  return { ul, subSection };
}
```

- [ ] **Step 2: 학교 코드 확인**

브라우저 콘솔 또는 curl:
```bash
curl "https://open.neis.go.kr/hub/schoolInfo?KEY=e5db69bb76264e79862b0527cfdd2db8&Type=json&SCHUL_NM=경기북과학고등학교"
```
응답에서 `SD_SCHUL_CODE` 값을 `env.js`의 `NEIS_SCHOOL_CODE`에 입력.

- [ ] **Step 3: commit**

```bash
git add timetable.js
git commit -m "feat: NEIS timetable API integration"
```

---

### Task 5: 캘린더 + 일정 CRUD

**Files:**
- Create: `calendar.html`
- Create: `calendar.js`

- [ ] **Step 1: calendar.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>경기북과학고 1학년 일정</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <script src="env.js"></script>

  <!-- 헤더 -->
  <header class="app-header">
    <h1>🏫 경기북과학고 1학년</h1>
    <div class="header-right">
      <span class="user-info" id="user-info"></span>
      <div style="position:relative">
        <button class="notification-btn" id="notif-btn">🔔<span class="notif-badge" id="notif-badge">0</span></button>
        <div class="notif-dropdown" id="notif-dropdown"></div>
      </div>
      <button class="btn btn-primary btn-sm" id="logout-btn">로그아웃</button>
    </div>
  </header>

  <!-- 반 탭 -->
  <div class="class-tabs" id="class-tabs">
    <div class="tab" data-class="1">1반</div>
    <div class="tab" data-class="2">2반</div>
    <div class="tab" data-class="3">3반</div>
    <div class="tab" data-class="4">4반</div>
    <div class="tab" data-class="5">5반</div>
  </div>

  <!-- 메인 -->
  <div class="main-content">
    <div class="calendar-section">
      <div class="calendar-nav">
        <button class="nav-btn" id="prev-month">◀</button>
        <h2 id="month-title"></h2>
        <button class="nav-btn" id="next-month">▶</button>
      </div>
      <div class="calendar-grid" id="calendar-grid"></div>
    </div>
    <div class="detail-panel">
      <div class="detail-card" id="detail-card">
        <p style="color:var(--text-muted);font-size:0.9rem">날짜를 클릭하면 시간표와 일정이 표시됩니다.</p>
      </div>
    </div>
  </div>

  <!-- 일정 추가 모달 -->
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <h3 id="modal-title">일정 추가</h3>
      <div class="type-selector">
        <div class="type-btn active" data-type="class">반 전체</div>
        <div class="type-btn" data-type="personal">개인</div>
        <div class="type-btn" data-type="group">그룹</div>
      </div>
      <div id="group-member-section" style="display:none">
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px">그룹 멤버 선택 (같은 반)</p>
        <div class="member-list" id="member-list"></div>
      </div>
      <div class="form-group"><label>제목</label><input type="text" id="modal-title-input" required></div>
      <div class="form-group"><label>세부 정보 (시간, 내용 등)</label><textarea id="modal-detail" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;resize:none"></textarea></div>
      <div class="file-input-area" id="file-drop">
        📎 파일 또는 사진 첨부 (클릭 또는 드래그)
        <input type="file" id="file-input" style="display:none" multiple>
      </div>
      <div id="file-list" style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">취소</button>
        <button class="btn btn-primary" id="modal-submit">저장</button>
      </div>
    </div>
  </div>

  <script type="module" src="calendar.js"></script>
</body>
</html>
```

- [ ] **Step 2: calendar.js 작성**

```javascript
// calendar.js
import { supabase, getProfile, requireAuth } from './app.js';
import { fetchTimetable, renderTimetable } from './timetable.js';

let profile = null;
let currentClass = 1;
let selectedDate = null;
let selectedSlot = null;
let selectedType = 'class';
let selectedMembers = [];
let selectedFiles = [];
let currentYear, currentMonth;

async function init() {
  profile = await requireAuth();
  if (!profile) return;
  profile = await getProfile();

  document.getElementById('user-info').textContent = `${profile.class_num}반 ${profile.seat_num}번 ${profile.name}`;
  currentClass = profile.class_num;

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  setupTabs();
  setupLogout();
  setupModal();
  setupNotifications();
  renderCalendar();
  loadNotifications();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    const c = parseInt(tab.dataset.class);
    if (c === profile.class_num) tab.classList.add('my-class');
    if (c === currentClass) tab.classList.add('active');
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentClass = c;
      renderCalendar();
      if (selectedDate) showDateDetail(selectedDate);
    });
  });
}

function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

async function renderCalendar() {
  const titleEl = document.getElementById('month-title');
  titleEl.textContent = `${currentYear}년 ${currentMonth + 1}월`;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // 요일 헤더
  ['일','월','화','수','목','금','토'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'calendar-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();

  // 이번 달 일정 가져오기
  const startDate = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-01`;
  const endDate = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${daysInMonth}`;
  const { data: schedules } = await supabase
    .from('schedules')
    .select('date, type')
    .eq('class_num', currentClass)
    .gte('date', startDate)
    .lte('date', endDate);

  const datesWithSchedule = new Set((schedules || []).map(s => s.date));

  // 빈 칸
  for (let i = 0; i < firstDay; i++) {
    const d = document.createElement('div');
    d.className = 'calendar-day other-month';
    grid.appendChild(d);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = document.createElement('div');
    d.className = 'calendar-day';
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) d.classList.add('today');
    if (selectedDate === dateStr) d.classList.add('selected');

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = day;
    d.appendChild(numEl);

    if (datesWithSchedule.has(dateStr)) {
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      d.appendChild(dot);
    }

    d.addEventListener('click', () => {
      document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
      d.classList.add('selected');
      selectedDate = dateStr;
      showDateDetail(dateStr);
    });

    grid.appendChild(d);
  }

  document.getElementById('prev-month').onclick = () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  };
  document.getElementById('next-month').onclick = () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  };
}

async function showDateDetail(date) {
  const panel = document.getElementById('detail-card');
  panel.innerHTML = `<h3>${date.slice(5).replace('-','월 ')}일</h3><p style="color:var(--text-muted);font-size:0.85rem">시간표 불러오는 중...</p>`;

  const [timetableSlots, schedulesRes] = await Promise.all([
    fetchTimetable(currentClass, date),
    supabase.from('schedules').select('*, attachments(*)').eq('class_num', currentClass).eq('date', date)
  ]);

  const schedules = schedulesRes.data || [];
  panel.innerHTML = `<h3>${date.slice(5).replace('-','월 ')}일</h3>`;

  if (timetableSlots.length === 0) {
    panel.innerHTML += `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">시간표 없음 (주말/공휴일)</p>`;
  } else {
    const { ul, subSection } = renderTimetable(
      timetableSlots, schedules, currentClass, date, profile.class_num,
      (slot) => openModal(date, slot)
    );
    panel.appendChild(ul);
    panel.appendChild(subSection);
  }

  // 일정 목록
  if (schedules.length > 0) {
    const listTitle = document.createElement('h4');
    listTitle.style.cssText = 'margin-top:16px;margin-bottom:8px;font-size:0.9rem;';
    listTitle.textContent = '일정 목록';
    panel.appendChild(listTitle);

    schedules.forEach(s => {
      const card = document.createElement('div');
      card.style.cssText = 'padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;font-size:0.85rem;';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${s.title}</strong>
          <span class="slot-badge badge-${s.type}">${s.type==='class'?'반전체':s.type==='personal'?'개인':'그룹'}</span>
        </div>
        ${s.detail ? `<p style="margin-top:4px;color:var(--text-muted)">${s.detail}</p>` : ''}
        ${(s.attachments||[]).map(a => `<a href="${a.file_url}" target="_blank" style="color:var(--primary);font-size:0.8rem">📎 ${a.file_name}</a>`).join('<br>')}
      `;
      if (currentClass === profile.class_num) {
        const delBtn = document.createElement('button');
        delBtn.textContent = '삭제';
        delBtn.style.cssText = 'margin-top:6px;padding:3px 10px;background:var(--danger);color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.75rem;';
        delBtn.addEventListener('click', async () => {
          await supabase.from('schedules').delete().eq('id', s.id);
          showDateDetail(date);
          renderCalendar();
        });
        card.appendChild(delBtn);
      }
      panel.appendChild(card);
    });
  }

  if (currentClass === profile.class_num) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.style.cssText = 'margin-top:12px;font-size:0.85rem;padding:8px;';
    addBtn.textContent = '+ 일정 추가';
    addBtn.addEventListener('click', () => openModal(date, null));
    panel.appendChild(addBtn);
  }
}

function setupModal() {
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      document.getElementById('group-member-section').style.display = selectedType === 'group' ? '' : 'none';
    });
  });

  document.getElementById('file-drop').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    document.getElementById('file-list').textContent = selectedFiles.map(f => f.name).join(', ');
  });

  document.getElementById('modal-submit').addEventListener('click', submitSchedule);
}

async function openModal(date, slot) {
  selectedDate = date;
  selectedSlot = slot;
  selectedType = 'class';
  selectedMembers = [];
  selectedFiles = [];

  document.getElementById('modal-title-input').value = '';
  document.getElementById('modal-detail').value = '';
  document.getElementById('file-list').textContent = '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="class"]').classList.add('active');
  document.getElementById('group-member-section').style.display = 'none';
  document.getElementById('modal-title').textContent = slot ? `${slot} 일정 추가` : '일정 추가 (날짜 전체)';

  // 같은 반 멤버 로드
  const { data: members } = await supabase.from('profiles').select('*').eq('class_num', profile.class_num).neq('id', profile.id);
  const memberList = document.getElementById('member-list');
  memberList.innerHTML = '';
  (members || []).forEach(m => {
    const item = document.createElement('label');
    item.className = 'member-item';
    item.innerHTML = `<input type="checkbox" value="${m.id}"> ${m.seat_num}번 ${m.name}`;
    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) selectedMembers.push(m.id);
      else selectedMembers = selectedMembers.filter(id => id !== m.id);
    });
    memberList.appendChild(item);
  });

  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

async function submitSchedule() {
  const title = document.getElementById('modal-title-input').value.trim();
  const detail = document.getElementById('modal-detail').value.trim();
  if (!title) { alert('제목을 입력해주세요.'); return; }
  if (selectedType === 'group' && selectedMembers.length === 0) { alert('그룹 멤버를 선택해주세요.'); return; }

  const { data: schedule, error } = await supabase.from('schedules').insert({
    class_num: profile.class_num,
    date: selectedDate,
    time_slot: selectedSlot || 'all-day',
    title,
    detail,
    type: selectedType,
    created_by: profile.id
  }).select().single();

  if (error) { alert('저장 실패: ' + error.message); return; }

  // 파일 업로드
  for (const file of selectedFiles) {
    const path = `${schedule.id}/${file.name}`;
    const { data: uploaded } = await supabase.storage.from('attachments').upload(path, file);
    if (uploaded) {
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
      await supabase.from('attachments').insert({ schedule_id: schedule.id, file_url: publicUrl, file_name: file.name });
    }
  }

  // 그룹 초대 처리
  if (selectedType === 'group') {
    for (const userId of selectedMembers) {
      await supabase.from('group_members').insert({ schedule_id: schedule.id, user_id: userId, status: 'pending' });
      await supabase.from('notifications').insert({ user_id: userId, schedule_id: schedule.id, type: 'group_invite' });
    }
  }

  closeModal();
  showDateDetail(selectedDate);
  renderCalendar();
}

async function loadNotifications() {
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*, schedules(title, created_by, profiles!schedules_created_by_fkey(name))')
    .eq('user_id', profile.id)
    .eq('is_read', false);

  const badge = document.getElementById('notif-badge');
  const dropdown = document.getElementById('notif-dropdown');

  if (!notifs || notifs.length === 0) { badge.classList.remove('show'); dropdown.innerHTML = '<p style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem">새 알림 없음</p>'; return; }

  badge.textContent = notifs.length;
  badge.classList.add('show');

  dropdown.innerHTML = '';
  notifs.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    const creatorName = n.schedules?.profiles?.name || '누군가';
    item.innerHTML = `
      <p class="notif-text">📨 <strong>${creatorName}</strong>님이 그룹 일정 "<strong>${n.schedules?.title}</strong>"에 초대했습니다.</p>
      <div class="notif-actions">
        <button class="btn-accept" data-notif="${n.id}" data-schedule="${n.schedule_id}">수락</button>
        <button class="btn-reject" data-notif="${n.id}" data-schedule="${n.schedule_id}">거절</button>
      </div>
    `;
    item.querySelector('.btn-accept').addEventListener('click', () => handleGroupInvite(n.id, n.schedule_id, true));
    item.querySelector('.btn-reject').addEventListener('click', () => handleGroupInvite(n.id, n.schedule_id, false));
    dropdown.appendChild(item);
  });
}

async function handleGroupInvite(notifId, scheduleId, accepted) {
  if (accepted) {
    await supabase.from('group_members').update({ status: 'accepted' }).eq('schedule_id', scheduleId).eq('user_id', profile.id);
  } else {
    // 거절 시 그룹 일정 전체 취소
    await supabase.from('schedules').delete().eq('id', scheduleId);
  }
  await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  loadNotifications();
  if (selectedDate) showDateDetail(selectedDate);
}

function setupNotifications() {
  const btn = document.getElementById('notif-btn');
  const dropdown = document.getElementById('notif-dropdown');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
}

init();
```

- [ ] **Step 3: 로컬에서 전체 기능 확인**

```bash
npx serve ~/myschedule
```

확인 항목:
- [ ] 회원가입 → 로그인 → 캘린더 진입
- [ ] 날짜 클릭 → 시간표 표시 (NEIS API)
- [ ] 교시 클릭 → 일정 추가 모달
- [ ] 반 전체 일정 추가 → 캘린더에 dot 표시
- [ ] 개인 일정 추가 → 본인만 보임
- [ ] 그룹 일정 → 알림 → 수락/거절

- [ ] **Step 4: commit**

```bash
git add calendar.html calendar.js timetable.js
git commit -m "feat: calendar, timetable, schedule CRUD with group invitations"
```

---

### Task 6: GitHub 업로드 + Vercel 배포

**Files:**
- 수정: `.gitignore` (env.js 추가 확인)

- [ ] **Step 1: .gitignore 최종 확인**

```
.env
env.js
node_modules/
.DS_Store
```

- [ ] **Step 2: GitHub 업로드**

```bash
cd ~/myschedule
gh repo create myschedule --public --source=. --remote=origin --push
```

- [ ] **Step 3: Vercel 배포**

```bash
vercel --prod
```

- [ ] **Step 4: Vercel 환경변수 등록**

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add NEIS_API_KEY
vercel env add NEIS_ATPT_CODE
vercel env add NEIS_SCHOOL_CODE
```

> Vercel 정적 사이트에서는 `env.js`를 빌드 시 자동 생성하는 방식이 필요.
> `vercel.json`에 빌드 훅 추가하거나, `api/env.js` 서버리스 함수로 환경변수를 제공.

- [ ] **Step 5: vercel.json 생성 (환경변수 주입)**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/$1" }]
}
```

그리고 `public/env.js`를 Vercel 빌드 시 자동 생성하는 대신,
`api/config.js` 서버리스 함수 방식으로 처리:

```javascript
// api/config.js
export default function handler(req, res) {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEIS_API_KEY: process.env.NEIS_API_KEY,
    NEIS_ATPT_CODE: process.env.NEIS_ATPT_CODE,
    NEIS_SCHOOL_CODE: process.env.NEIS_SCHOOL_CODE
  });
}
```

각 HTML 파일 `<head>`에 아래 추가 (env.js script 태그 대체):
```html
<script>
fetch('/api/config').then(r=>r.json()).then(cfg=>{ window.__ENV = cfg; });
</script>
```

- [ ] **Step 6: 재배포 및 URL 확인**

```bash
git add .
git commit -m "feat: vercel deployment config"
git push
vercel --prod
```

배포 URL로 접속하여 전체 기능 동작 확인.
