const https = require('https');

const API_KEY = process.env.NEIS_API_KEY;
const ATPT_CODE = 'J10';
const SCHOOL_CODE = '7530851'; // 경기북과학고등학교

const scheduleCache = new Map(); // key: 'YYYYMM'
const mealCache = new Map();     // key: 'YYYYMMDD_N'
const SCHEDULE_TTL = 24 * 60 * 60 * 1000; // 24h
const MEAL_TTL = 60 * 60 * 1000;           // 1h

function neisGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://open.neis.go.kr/hub/${path}`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, month, date, mealCode } = req.query;

  try {
    if (type === 'schedule') {
      if (!month || !/^\d{6}$/.test(month)) return res.status(400).json({ error: 'invalid month' });
      const cached = scheduleCache.get(month);
      if (cached && Date.now() - cached.ts < SCHEDULE_TTL) return res.json(cached.data);

      const from = month + '01';
      const to = month + '31';
      const data = await neisGet(
        `SchoolSchedule?KEY=${API_KEY}&Type=json&pIndex=1&pSize=100` +
        `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}` +
        `&AA_FROM_YMD=${from}&AA_TO_YMD=${to}`
      );
      const rows = data?.SchoolSchedule?.[1]?.row || [];
      const result = rows.map(r => ({ date: r.AA_YMD, name: r.EVENT_NM }));
      scheduleCache.set(month, { data: result, ts: Date.now() });
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.json(result);
    }

    if (type === 'meal') {
      if (!date || !mealCode) return res.status(400).json({ error: 'invalid params' });
      const key = `${date}_${mealCode}`;
      const cached = mealCache.get(key);
      if (cached && Date.now() - cached.ts < MEAL_TTL) return res.json(cached.data);

      const data = await neisGet(
        `mealServiceDietInfo?KEY=${API_KEY}&Type=json&pIndex=1&pSize=5` +
        `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}` +
        `&MLSV_YMD=${date}&MMEAL_SC_CODE=${mealCode}`
      );
      const rows = data?.mealServiceDietInfo?.[1]?.row || [];
      const result = rows[0]
        ? {
            menu: (rows[0].DDISH_NM || '').replace(/<br\/>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean),
            cal: rows[0].CAL_INFO || '',
          }
        : null;
      mealCache.set(key, { data: result, ts: Date.now() });
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.json(result);
    }

    return res.status(400).json({ error: 'unknown type' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
