import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(2);
}

const users = [
  { email: 'tayyabbusinesses0@gmail.com', password: 'Ub@id301' },
  { email: 'ertugralghazi451@gmail.com', password: 'Ub@id301' },
];

async function signIn(email, password) {
  // Supabase accepts a POST to /auth/v1/token?grant_type=password with a JSON body
  const url = `${SUPA_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
}

async function insertTransaction(accessToken, row) {
  const url = `${SUPA_URL}/rest/v1/transactions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(row),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

async function queryTransactionsForUser(accessToken, userId) {
  const url = `${SUPA_URL}/rest/v1/transactions?select=*&user_id=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

(async () => {
  console.log('Using Supabase URL:', SUPA_URL);

  for (const u of users) {
    console.log('\nSigning in', u.email);
    const r = await signIn(u.email, u.password);
    console.log('signIn status:', r.status, 'ok=', r.ok);
    if (!r.ok) {
      console.error('Sign in failed for', u.email, '-', JSON.stringify(r.body));
      continue;
    }
    const token = r.body?.access_token || (r.body?.session && r.body.session.access_token);
    const userId = r.body?.user?.id || (r.body?.session && r.body.session.user && r.body.session.user.id);
    if (!token || !userId) {
      console.error('No token/userId returned for', u.email, JSON.stringify(r.body));
      continue;
    }
    console.log('Signed in. user id:', userId);

    // Insert a test transaction
  // Use a valid UUID for the primary key so Postgres accepts the row
  const id = crypto.randomUUID();
  const row = { id, user_id: userId, date: new Date().toISOString().slice(0,10), account: 'checking', type: 'expense', amount: 1.23, category: 'ScriptTest', description: 'Inserted by supacheck_signin' };
    const ins = await insertTransaction(token, row);
    console.log('Insert status:', ins.status, 'ok=', ins.ok);
    if (!ins.ok) console.error('Insert failed body:', JSON.stringify(ins.body));
    else console.log('Inserted record:', JSON.stringify(ins.body));

    // Query back per-user
    const q = await queryTransactionsForUser(token, userId);
    console.log('Query status:', q.status, 'ok=', q.ok, 'records_found=', Array.isArray(q.body) ? q.body.length : 'unknown');
    if (q.ok) console.log('Sample records:', JSON.stringify(q.body).slice(0,1000));
  }

  console.log('\nDone.');
})();
