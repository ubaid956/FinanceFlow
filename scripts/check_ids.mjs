import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('.env not found at', envPath);
  process.exit(2);
}
const env = fs.readFileSync(envPath, 'utf8').split(/\n/).reduce((acc, line) => {
  const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
  if (m) acc[m[1]] = m[2].replace(/(^"|"$)/g, '');
  return acc;
}, {});
const SUPA_URL = env.VITE_SUPABASE_URL;
const SUPA_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing env'); process.exit(2); }
const ids = [
  'test-1765585927481-kqkosi',
  'test-1765585983786-eajb1q',
  'test-1765586025581-xqq1de',
  'test-1765585985206-ermh0c',
  'test-1765586026786-ijsb7k',
];
(async()=>{
  for(const id of ids){
    const url = `${SUPA_URL}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&select=*`;
    try{
      const res = await fetch(url,{ headers: { apikey: SUPA_KEY } });
      const body = await res.json().catch(()=>null);
      console.log(id, 'status', res.status, 'found', Array.isArray(body)? body.length: 'unknown', JSON.stringify(body).slice(0,200));
    }catch(err){ console.error('err',err.message); }
  }
})();
