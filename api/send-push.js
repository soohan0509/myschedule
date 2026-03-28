const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {
    if (type === 'schedule_added') {
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
      const secret = req.headers['x-cron-secret'] || req.query.secret;
      if (secret !== process.env.CRON_SECRET) {
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

async function sendPush(subscriptionObj, payload) {
  try {
    await webpush.sendNotification(subscriptionObj, JSON.stringify(payload));
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscriptionObj.endpoint);
    }
  }
}

async function handleScheduleAdded({ classNum, title, excludeUserId }) {
  if (!classNum || !title) return;

  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('subscription, user_id, notification_settings!inner(schedule_added)')
    .neq('user_id', excludeUserId || '')
    .eq('notification_settings.schedule_added', true);

  if (!rows || rows.length === 0) return;

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

async function handleCron() {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const hh = String(kstNow.getUTCHours()).padStart(2, '0');
  const mm = String(kstNow.getUTCMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const todayStr = [
    kstNow.getUTCFullYear(),
    String(kstNow.getUTCMonth() + 1).padStart(2, '0'),
    String(kstNow.getUTCDate()).padStart(2, '0')
  ].join('-');

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('user_id, day_of_time, day_before_time, two_days_before_time');
  if (!settings) return;

  for (const s of settings) {
    const toCheck = [];
    if (s.day_of_time && s.day_of_time.slice(0, 5) === currentTime)
      toCheck.push({ date: todayStr, label: '오늘' });
    if (s.day_before_time && s.day_before_time.slice(0, 5) === currentTime)
      toCheck.push({ date: addDays(todayStr, 1), label: '내일' });
    if (s.two_days_before_time && s.two_days_before_time.slice(0, 5) === currentTime)
      toCheck.push({ date: addDays(todayStr, 2), label: '모레' });
    if (toCheck.length === 0) continue;

    const { data: prof } = await supabase
      .from('profiles')
      .select('class_num')
      .eq('id', s.user_id)
      .single();
    if (!prof) continue;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', s.user_id);
    if (!subs || subs.length === 0) continue;

    for (const { date, label } of toCheck) {
      const { data: classSched } = await supabase
        .from('schedules')
        .select('title')
        .eq('class_num', prof.class_num)
        .eq('date', date)
        .eq('type', 'class');

      const { data: personalSched } = await supabase
        .from('schedules')
        .select('title')
        .eq('created_by', s.user_id)
        .eq('date', date)
        .eq('type', 'personal');

      const all = [...(classSched || []), ...(personalSched || [])];
      if (all.length === 0) continue;

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
