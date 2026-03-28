# Push Notifications Design

**Date:** 2026-03-28
**Project:** 경기북과학고 1학년 일정 (GBSHS Schedule)

## Overview

Web Push API 기반 푸시 알림 시스템. 앱이 닫혀 있어도 알림 수신 가능. cron-job.org(무료)가 1분마다 Vercel API를 호출하여 예약된 알림을 발송.

## Notification Types

| 종류 | 트리거 | 대상 |
|------|--------|------|
| 일정 추가 | 반/그룹 일정 저장 즉시 | 해당 반 전체 또는 그룹 멤버 |
| 당일 알림 | 당일 사용자 설정 시각 | 해당 날짜에 일정 있는 사용자 |
| 전날 알림 | 전날 사용자 설정 시각 | 다음 날 일정 있는 사용자 |
| 전전날 알림 | 전전날 사용자 설정 시각 | D+2에 일정 있는 사용자 |

일정이 없는 날에는 날짜별 알림 발송하지 않음.

## Architecture

```
[브라우저] 알림 허용
  └─ PushSubscription 생성 → POST /api/save-subscription → Supabase

[일정 저장 시]
  └─ POST /api/send-push?type=schedule_added

[cron-job.org] 1분마다
  └─ POST /api/send-push?type=cron
       └─ notification_settings에서 현재 시각 일치 사용자 조회
       └─ 해당 날짜 일정 있는 사용자 필터
       └─ web-push로 발송

[Service Worker] push 이벤트 수신
  └─ self.registration.showNotification() 으로 표시
```

## Data Model

### `push_subscriptions` (신규)
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE
subscription jsonb NOT NULL   -- { endpoint, keys: { p256dh, auth } }
created_at   timestamptz DEFAULT now()
```

### `notification_settings` (신규)
```sql
user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE
schedule_added      boolean DEFAULT true
day_of_time         time    -- null = OFF (당일 알림)
day_before_time     time    -- null = OFF (전날 알림)
two_days_before_time time   -- null = OFF (전전날 알림)
```

## API Endpoints

### `POST /api/save-subscription`
- Body: `{ subscription: PushSubscription }`
- 인증: Supabase JWT (Authorization header)
- 동작: user_id + subscription을 push_subscriptions에 upsert

### `POST /api/send-push`
- Query: `type=schedule_added | cron`
- `schedule_added`: body에 `{ classNum, title, excludeUserId }` → 해당 반 구독자에게 즉시 발송
- `cron`: 현재 시각 기준으로 날짜별 알림 대상 조회 후 발송
- 인증: 내부 secret key (`CRON_SECRET` env var)로 검증

## Settings UI

기존 ⚙️ 설정 모달 하단에 "🔔 알림 설정" 섹션 추가:

```
[알림 허용하기] 버튼  ← 최초 1회, 허용 후 "알림 활성화됨" 표시

[✓] 새 일정 추가 시 알림

[  ] 당일 알림    [07:00] ← 시간 입력
[  ] 전날 알림    [21:00]
[  ] 전전날 알림  [21:00]
```

설정 변경 시 즉시 Supabase `notification_settings`에 저장.

## Environment Variables (추가 필요)
- `VAPID_PUBLIC_KEY` — web-push VAPID 공개키
- `VAPID_PRIVATE_KEY` — web-push VAPID 비공개키
- `VAPID_EMAIL` — VAPID 발급자 이메일
- `CRON_SECRET` — cron-job.org에서 API 호출 시 인증 secret

## iOS 제약
iOS 16.4+ Safari에서 홈화면에 설치된 PWA에서만 푸시 수신 가능. 브라우저 탭으로 열었을 때는 알림 허용 버튼 비활성화 + 안내 문구 표시.

## Files to Create/Modify
- `api/send-push.js` — 신규
- `api/save-subscription.js` — 신규
- `service-worker.js` — push 이벤트 핸들러 추가
- `calendar.js` — 일정 저장 시 send-push 호출 추가
- `calendar.html` — 설정 모달 UI 추가
