# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Push API 기반 푸시 알림 구현 — 일정 추가 즉시 알림 + 당일/전날/전전날 예약 알림 (앱 닫혀있어도 수신)

**Architecture:** 브라우저 Web Push API로 구독 → Supabase에 구독 저장 → cron-job.org가 1분마다 `/api/send-push?type=cron` 호출 → Vercel 함수가 Supabase 조회 후 web-push 라이브러리로 발송. 일정 추가 시엔 프론트에서 직접 `/api/send-push?type=schedule_added` 호출.

**Tech Stack:** web-push (npm), Supabase (DB + Auth), Vercel Serverless Functions, cron-job.org (무료 크론)

---

## File Map

| 파일 | 작업 |
|------|------|
| `api/send-push.js` | 신규 — 푸시 발송 메인 API |
| `api/save-subscription.js` | 신규 — 브라우저 구독 저장 API |
| `service-worker.js` | 수정 — push/notificationclick 이벤트 추가 |
| `build.js` | 수정 — VAPID_PUBLIC_KEY env 노출 추가 |
| `calendar.html` | 수정 — 설정 모달에 알림 설정 UI 추가 |
| `calendar.js` | 수정 — setupNotificationSettings() 추가, 일정 저장 후 푸시 호출 |

---

### Task 1: web-push 설치 + VAPID 키 생성

**Files:**
- Modify: `package.json`

- [ ] **Step 1: web-push 설치**

```bash
cd /home/soohan/myschedule && npm install web-push
```

Expected: `package.json`에 `"web-push"` 추가됨

- [ ] **Step 2: VAPID 키 생성**

```bash
npx web-push generate-vapid-keys
```

Expected output (예시, 실제 키는 다름):
```
=======================================
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

Private Key:
UUxI4O8-FbRouAevSmBQ6co62groZR1nggkDbn61OA
=======================================
```

이 값을 복사해 Step 3에 사용.

- [ ] **Step 3: Vercel 환경변수 등록**

```bash
# 각 명령 실행 시 붙여넣기 입력
npx vercel env add VAPID_PUBLIC_KEY production
npx vercel env add VAPID_PRIVATE_KEY production
npx vercel env add VAPID_EMAIL production
# VAPID_EMAIL 값: mailto:admin@gbshs.kr (또는 실제 이메일)
npx vercel env add CRON_SECRET production
# CRON_SECRET 값: 랜덤 문자열 (예: openssl rand -hex 32 로 생성)
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Supabase Dashboard → Settings → API → service_role key 값
```

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: add web-push dependency"
```

---

### Task 2: Supabase 테이블 생성

**Files:**
- 없음 (Supabase SQL Editor에서 직접 실행)

- [ ] **Step 1: push_subscriptions 테이블 생성**

Supabase Dashboard → SQL Editor에서 실행:

```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: notification_settings 테이블 생성**

```sql
CREATE TABLE notification_settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_added boolean DEFAULT true,
  day_of_time time,
  day_before_time time,
  two_days_before_time time
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own settings"
  ON notification_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 3: 생성 확인**

Supabase Dashboard → Table Editor에서 `push_subscriptions`, `notification_settings` 테이블 확인.

---

### Task 3: `/api/save-subscription.js` 생성

**Files:**
- Create: `api/save-subscription.js`

- [ ] **Step 1: 파일 생성**

```javascript
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  // 사용자 JWT로 Supabase 클라이언트 생성 (RLS 적용됨)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'unauthorized' });

  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'missing subscription' });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: subscription.endpoint, subscription },
      { onConflict: 'endpoint' }
    );

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
};
```

- [ ] **Step 2: 로컬 테스트 (선택)**

```bash
# Vercel dev 서버 실행 후 확인
npx vercel dev
```

---

### Task 4: `/api/send-push.js` 생성

**Files:**
- Create: `api/send-push.js`

- [ ] **Step 1: 파일 생성**

```javascript
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// 서비스 롤 키로 RLS 우회 (서버 전용)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type } = req.query;

  try {
    if (type === 'schedule_added') {
      // 프론트에서 호출 — Supabase JWT 검증
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'unauthorized' });
      const userClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { error: authError } = await userClient.auth.getUser();
      if (authError) return res.status(401).json({ error: 'unauthorized' });

      await handleScheduleAdded(req.body);

    } else if (type === 'cron') {
      // cron-job.org 호출 — CRON_SECRET 검증
      if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      await handleCron();

    } else {
      return res.status(400).json({ error: 'unknown type' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('send-push error:', e);
    return res.status(500).json({ error: e.message });
  }
};

// 만료된 구독 삭제 후 푸시 발송
async function sendPush(subscriptionObj, payload) {
  try {
    await webpush.sendNotification(subscriptionObj, JSON.stringify(payload));
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      // 구독 만료 → 삭제
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscriptionObj.endpoint);
    }
  }
}

// ─── 일정 추가 즉시 알림 ───────────────────────────
async function handleScheduleAdded({ classNum, title, excludeUserId }) {
  if (!classNum || !title) return;

  // 해당 반 + schedule_added=true 구독자 조회
  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('subscription, user_id, notification_settings!inner(schedule_added)')
    .neq('user_id', excludeUserId || '')
    .eq('notification_settings.schedule_added', true);

  if (!rows || rows.length === 0) return;

  // 같은 반인 사용자만 필터
  const userIds = rows.map(r => r.user_id);
  const { data: profs } = await supabase
    .from('profiles')
    .select('id')
    .eq('class_num', classNum)
    .in('id', userIds);

  if (!profs || profs.length === 0) return;
  const targetSet = new Set(profs.map(p => p.id));

  const targets = rows.filter(r => targetSet.has(r.user_id));
  const payload = { title: '📅 새 일정', body: title, icon: '/icons/icon-192.png', url: '/calendar.html' };
  await Promise.all(targets.map(r => sendPush(r.subscription, payload)));
}

// ─── 날짜별 예약 알림 (크론) ──────────────────────
async function handleCron() {
  // 한국 시각 계산 (UTC+9)
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const hh = String(kstNow.getUTCHours()).padStart(2, '0');
  const mm = String(kstNow.getUTCMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const todayStr = [
    kstNow.getUTCFullYear(),
    String(kstNow.getUTCMonth() + 1).padStart(2, '0'),
    String(kstNow.getUTCDate()).padStart(2, '0')
  ].join('-');

  // 날짜 +N일
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // 모든 알림 설정 조회
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, schedule_added, day_of_time, day_before_time, two_days_before_time');
  if (!settings) return;

  for (const s of settings) {
    // 현재 시각에 맞는 알림 종류 파악
    const toCheck = [];
    if (s.day_of_time && s.day_of_time.slice(0, 5) === currentTime) {
      toCheck.push({ date: todayStr, label: '오늘' });
    }
    if (s.day_before_time && s.day_before_time.slice(0, 5) === currentTime) {
      toCheck.push({ date: addDays(todayStr, 1), label: '내일' });
    }
    if (s.two_days_before_time && s.two_days_before_time.slice(0, 5) === currentTime) {
      toCheck.push({ date: addDays(todayStr, 2), label: '모레' });
    }
    if (toCheck.length === 0) continue;

    // 사용자 반 조회
    const { data: prof } = await supabase
      .from('profiles')
      .select('class_num')
      .eq('id', s.user_id)
      .single();
    if (!prof) continue;

    // 푸시 구독 조회
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', s.user_id);
    if (!subs || subs.length === 0) continue;

    for (const { date, label } of toCheck) {
      // 해당 날짜 반 일정 조회
      const { data: classSched } = await supabase
        .from('schedules')
        .select('title')
        .eq('class_num', prof.class_num)
        .eq('date', date)
        .eq('type', 'class');

      // 개인 일정 조회
      const { data: personalSched } = await supabase
        .from('schedules')
        .select('title')
        .eq('created_by', s.user_id)
        .eq('date', date)
        .eq('type', 'personal');

      const all = [...(classSched || []), ...(personalSched || [])];
      if (all.length === 0) continue; // 일정 없으면 알림 안 보냄

      const preview = all.slice(0, 3).map(s => s.title).join(', ');
      const more = all.length > 3 ? ` 외 ${all.length - 3}개` : '';
      const payload = {
        title: `📅 ${label} 일정`,
        body: preview + more,
        icon: '/icons/icon-192.png',
        url: '/calendar.html'
      };

      await Promise.all(subs.map(sub => sendPush(sub.subscription, payload)));
    }
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/send-push.js api/save-subscription.js
git commit -m "feat: add push notification API endpoints"
```

---

### Task 5: `service-worker.js` 업데이트

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: push + notificationclick 이벤트 추가**

`service-worker.js` 파일 끝에 아래 코드 추가:

```javascript
// ─── Push 수신 ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: '경기북과학고 일정', body: '새 알림이 있습니다.', icon: '/icons/icon-192.png', url: '/calendar.html' };
  try { data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/icons/icon-192.png',
      data: { url: data.url }
    })
  );
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/calendar.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: 캐시 버전 업데이트** (service-worker.js 상단)

`CACHE_NAME` 값을 `'gbshs-schedule-v1'` → `'gbshs-schedule-v2'` 로 변경.

- [ ] **Step 3: 커밋**

```bash
git add service-worker.js
git commit -m "feat: add push event handler to service worker"
```

---

### Task 6: `build.js` 업데이트 — VAPID_PUBLIC_KEY 노출

**Files:**
- Modify: `build.js`

- [ ] **Step 1: VAPID_PUBLIC_KEY를 env.js에 포함**

`build.js` 전체를 아래로 교체:

```javascript
const fs = require('fs');
const content = `window.__ENV = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
  SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
  VAPID_PUBLIC_KEY: '${process.env.VAPID_PUBLIC_KEY || ''}'
};`;
fs.writeFileSync('env.js', content);
console.log('env.js generated');
```

- [ ] **Step 2: 커밋**

```bash
git add build.js
git commit -m "feat: expose VAPID_PUBLIC_KEY to frontend via env.js"
```

---

### Task 7: `calendar.html` 설정 모달에 알림 UI 추가

**Files:**
- Modify: `calendar.html`

- [ ] **Step 1: 설정 모달 `탈퇴하기` 버튼 뒤에 알림 설정 섹션 추가**

`calendar.html`에서 아래 코드를 찾아:

```html
      <button class="btn" style="background:var(--danger);color:white;width:100%" id="withdraw-btn">탈퇴하기</button>
    </div>
  </div>
```

아래로 교체:

```html
      <button class="btn" style="background:var(--danger);color:white;width:100%" id="withdraw-btn">탈퇴하기</button>

      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">

      <h4 style="margin-bottom:14px">🔔 알림 설정</h4>

      <div id="notif-ios-warning" style="display:none;background:#fff3cd;color:#856404;border-radius:8px;padding:10px 12px;font-size:0.82rem;margin-bottom:12px">
        ⚠️ iOS에서 푸시 알림을 받으려면 Safari로 접속 후 홈화면에 앱을 추가해야 합니다.
      </div>

      <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <button class="btn btn-primary btn-sm" id="notif-permission-btn">알림 허용하기</button>
        <span id="notif-permission-status" style="font-size:0.85rem;color:var(--text-muted)"></span>
      </div>

      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="notif-schedule-added" style="width:auto;margin:0">
        <label for="notif-schedule-added" style="margin:0;font-size:0.9rem;cursor:pointer">새 일정 추가 시 즉시 알림</label>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <input type="checkbox" id="notif-day-of" style="width:auto;margin:0">
        <label for="notif-day-of" style="margin:0;font-size:0.9rem;min-width:70px;cursor:pointer">당일 알림</label>
        <input type="time" id="notif-day-of-time" style="width:auto;margin:0;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <input type="checkbox" id="notif-day-before" style="width:auto;margin:0">
        <label for="notif-day-before" style="margin:0;font-size:0.9rem;min-width:70px;cursor:pointer">전날 알림</label>
        <input type="time" id="notif-day-before-time" style="width:auto;margin:0;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <input type="checkbox" id="notif-two-days-before" style="width:auto;margin:0">
        <label for="notif-two-days-before" style="margin:0;font-size:0.9rem;min-width:70px;cursor:pointer">전전날 알림</label>
        <input type="time" id="notif-two-days-before-time" style="width:auto;margin:0;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">
      </div>

      <button class="btn btn-primary" id="notif-settings-save-btn">알림 설정 저장</button>
      <p class="error-msg" id="notif-settings-msg"></p>
    </div>
  </div>
```

- [ ] **Step 2: 커밋**

```bash
git add calendar.html
git commit -m "feat: add notification settings UI to settings modal"
```

---

### Task 8: `calendar.js` 알림 설정 로직 추가

**Files:**
- Modify: `calendar.js`

- [ ] **Step 1: `init()` 함수에 `setupNotificationSettings()` 호출 추가**

`calendar.js`에서:
```javascript
  await loadNotifications();
  showExamNotification();
}
```
를 찾아 아래로 교체:
```javascript
  await loadNotifications();
  showExamNotification();
  await setupNotificationSettings();
}
```

- [ ] **Step 2: 파일 끝 (마지막 `}` 위) 에 알림 설정 함수 추가**

`calendar.js` 파일의 마지막 줄 앞에 아래 코드 추가:

```javascript
// ─── 푸시 알림 설정 ────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeUser() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(window.__ENV.VAPID_PUBLIC_KEY)
    });
  }
  const { data: { session } } = await supabase.auth.getSession();
  await fetch('/api/save-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ subscription: sub.toJSON() })
  });
  return sub;
}

function updateNotifPermissionUI() {
  const status = Notification.permission;
  const btn = document.getElementById('notif-permission-btn');
  const statusEl = document.getElementById('notif-permission-status');
  if (status === 'granted') {
    btn.style.display = 'none';
    statusEl.textContent = '✓ 알림 활성화됨';
  } else if (status === 'denied') {
    btn.style.display = 'none';
    statusEl.textContent = '알림이 차단됨 — 브라우저 설정에서 허용해주세요.';
  } else {
    btn.style.display = '';
    statusEl.textContent = '';
  }
}

async function setupNotificationSettings() {
  if (!('Notification' in window)) return; // 알림 미지원 브라우저

  // iOS + 비설치(PWA 아닌) 경우 경고 표시
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isIOS && !isStandalone) {
    document.getElementById('notif-ios-warning').style.display = 'block';
  }

  updateNotifPermissionUI();

  document.getElementById('notif-permission-btn').addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') await subscribeUser();
    updateNotifPermissionUI();
  });

  // 기존 설정 불러오기
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', profile.id)
    .single();

  if (settings) {
    document.getElementById('notif-schedule-added').checked = settings.schedule_added ?? true;
    if (settings.day_of_time) {
      document.getElementById('notif-day-of').checked = true;
      document.getElementById('notif-day-of-time').value = settings.day_of_time.slice(0, 5);
    }
    if (settings.day_before_time) {
      document.getElementById('notif-day-before').checked = true;
      document.getElementById('notif-day-before-time').value = settings.day_before_time.slice(0, 5);
    }
    if (settings.two_days_before_time) {
      document.getElementById('notif-two-days-before').checked = true;
      document.getElementById('notif-two-days-before-time').value = settings.two_days_before_time.slice(0, 5);
    }
  }

  // 저장 버튼
  document.getElementById('notif-settings-save-btn').addEventListener('click', async () => {
    const dayOf = document.getElementById('notif-day-of').checked
      ? (document.getElementById('notif-day-of-time').value || null) : null;
    const dayBefore = document.getElementById('notif-day-before').checked
      ? (document.getElementById('notif-day-before-time').value || null) : null;
    const twoDaysBefore = document.getElementById('notif-two-days-before').checked
      ? (document.getElementById('notif-two-days-before-time').value || null) : null;

    const { error } = await supabase
      .from('notification_settings')
      .upsert({
        user_id: profile.id,
        schedule_added: document.getElementById('notif-schedule-added').checked,
        day_of_time: dayOf,
        day_before_time: dayBefore,
        two_days_before_time: twoDaysBefore
      }, { onConflict: 'user_id' });

    const msgEl = document.getElementById('notif-settings-msg');
    if (error) {
      msgEl.textContent = '저장 실패: ' + error.message;
      msgEl.style.color = 'var(--danger)';
    } else {
      msgEl.textContent = '알림 설정이 저장됐습니다.';
      msgEl.style.color = '#28a745';
    }
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 2000);
  });
}
```

- [ ] **Step 3: 일정 저장 후 send-push 호출 추가**

`calendar.js`에서 아래 코드를 찾아:

```javascript
  closeModal();
  showToast('일정이 저장됐습니다.', 'success');
  submitBtn.disabled = false;
  submitBtn.textContent = '저장';
  await renderCalendar();
  await showDateDetail(selectedDate);
```

아래로 교체:

```javascript
  // 반 전체 일정이면 같은 반 구독자에게 푸시 알림 (fire & forget)
  if (selectedType === 'class') {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetch('/api/send-push?type=schedule_added', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ classNum: profile.class_num, title, excludeUserId: profile.id })
      }).catch(() => {});
    });
  }

  closeModal();
  showToast('일정이 저장됐습니다.', 'success');
  submitBtn.disabled = false;
  submitBtn.textContent = '저장';
  await renderCalendar();
  await showDateDetail(selectedDate);
```

- [ ] **Step 4: 커밋**

```bash
git add calendar.js
git commit -m "feat: notification settings logic and push trigger on schedule save"
```

---

### Task 9: Vercel 배포 + cron-job.org 설정

**Files:**
- 없음 (설정 작업)

- [ ] **Step 1: Vercel 배포**

```bash
npx vercel --prod
npx vercel alias set <새 배포 URL> gbshs-schedule.vercel.app
```

- [ ] **Step 2: cron-job.org 설정**

1. [cron-job.org](https://cron-job.org) 회원가입
2. "Create cronjob" 클릭
3. 설정:
   - URL: `https://gbshs-schedule.vercel.app/api/send-push?type=cron`
   - Schedule: `* * * * *` (매 1분)
   - Request method: `POST`
   - Headers: `X-Cron-Secret: <CRON_SECRET 값>`
   - Body: (비워둠)
4. 저장 후 활성화

- [ ] **Step 3: 동작 확인**

브라우저에서 https://gbshs-schedule.vercel.app 접속 → 설정 모달 → 알림 설정 섹션 확인.
"알림 허용하기" 클릭 → 브라우저 알림 허용 팝업 확인.
전날 알림 시각을 현재 시각으로 설정 저장 → 1분 내 푸시 알림 수신 확인.

---

### Task 10: 앱 소개글 업데이트

**Files:**
- 없음 (텍스트 작업)

- [ ] **Step 1: 소개글에 푸시 알림 안내 추가**

구현 완료 후 사용자에게 아래 내용이 포함된 업데이트된 소개글 제공:

추가할 내용:
- "⚙️ 설정 → 알림 설정에서 푸시 알림 ON/OFF 및 시간 설정 가능"
- "📱 iOS는 반드시 Safari로 접속 후 홈화면에 추가한 앱에서만 알림 수신 가능"
- 알림 종류: 새 일정 추가 시 즉시 / 당일·전날·전전날 원하는 시각에
