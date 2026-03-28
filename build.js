const fs = require('fs');
const content = `window.__ENV = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
  SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
  VAPID_PUBLIC_KEY: '${process.env.VAPID_PUBLIC_KEY || ''}'
};`;
fs.writeFileSync('env.js', content);
console.log('env.js generated');
