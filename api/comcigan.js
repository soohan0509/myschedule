const Timetable = require('comcigan-parser');

const SCHOOL_CODE = 12045;

// 컴시간 사이트 스크립트가 대체수업(변경사항)이 있는 날 'numberPart' 변수를
// 선언 없이 할당하는데, comcigan-parser가 이 스크립트를 클래스 메서드 안에서
// eval()하기 때문에(암묵적 strict mode) 그 할당이 ReferenceError로 죽는다.
// eval 직전에 var 선언을 주입해 우회한다.
const timetableProto = Object.getPrototypeOf(new Timetable());
const originalGetClassTimetable = timetableProto._getClassTimetable;
timetableProto._getClassTimetable = function (codeConfig, grade, classNumber) {
  return originalGetClassTimetable.call(
    this,
    { ...codeConfig, script: 'var numberPart;\n' + codeConfig.script },
    grade,
    classNumber
  );
};

module.exports = async function handler(req, res) {
  const classNum = parseInt(req.query.class);
  const day = parseInt(req.query.day); // 0=월, 1=화, 2=수, 3=목, 4=금

  if (!classNum || classNum < 1 || classNum > 5 || isNaN(day) || day < 0 || day > 4) {
    return res.status(400).json({ error: 'invalid params' });
  }

  try {
    const t = new Timetable();
    await t.init();
    t.setSchool(SCHOOL_CODE);
    const timetable = await t.getTimetable();

    const dayData = (timetable[1]?.[classNum]?.[day]) || [];
    const result = {};
    dayData.forEach(item => {
      if (item && item.subject) {
        result[item.classTime + '교시'] = { subject: item.subject, teacher: item.teacher };
      }
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
