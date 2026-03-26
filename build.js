const fs = require('fs');
const content = `window.__ENV = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
  SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
  NEIS_API_KEY: '${process.env.NEIS_API_KEY || ''}',
  NEIS_ATPT_CODE: '${process.env.NEIS_ATPT_CODE || ''}',
  NEIS_SCHOOL_CODE: '${process.env.NEIS_SCHOOL_CODE || ''}'
};`;
fs.writeFileSync('env.js', content);
console.log('env.js generated');
