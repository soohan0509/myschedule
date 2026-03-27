const Timetable = require('comcigan-parser');

const SCHOOL_CODE = 12045;
let cache = null;
let cacheAt = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간

module.exports = async function handler(req, res) {
  const classNum = parseInt(req.query.class);
  const day = parseInt(req.query.day); // 0=월, 1=화, 2=수, 3=목, 4=금

  if (!classNum || classNum < 1 || classNum > 5 || isNaN(day) || day < 0 || day > 4) {
    return res.status(400).json({ error: 'invalid params' });
  }

  try {
    if (!cache || Date.now() - cacheAt > CACHE_TTL) {
      const t = new Timetable();
      await t.init();
      t.setSchool(SCHOOL_CODE);
      cache = await t.getTimetable();
      cacheAt = Date.now();
    }

    const dayData = (cache[1]?.[classNum]?.[day]) || [];
    const result = {};
    dayData.forEach(item => {
      if (item && item.subject) {
        result[item.classTime + '교시'] = { subject: item.subject, teacher: item.teacher };
      }
    });

    res.setHeader('Cache-Control', 's-maxage=21600');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
