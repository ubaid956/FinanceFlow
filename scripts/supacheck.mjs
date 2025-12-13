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
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(2);
}

const headers = {
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
};

async function fetchTableSample(table) {
  const url = `${SUPA_URL}/rest/v1/${table}?select=*&limit=1`;
  const res = await fetch(url, { headers });
  return { status: res.status, ok: res.ok, body: await res.text() };
}

async function signUp(email, password) {
  const url = `${SUPA_URL}/auth/v1/signup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, ok: res.ok, body: json || body };
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
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, ok: res.ok, body: json || body };
}

async function queryTransactionsForUser(accessToken, userId) {
  const url = `${SUPA_URL}/rest/v1/transactions?select=*&user_id=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: res.status, ok: res.ok, body: json || body };
}

(async () => {
  console.log('Using Supabase URL:', SUPA_URL);

  const tables = ['transactions','budgets','recurring_transactions'];
  for (const t of tables) {
    try {
      const r = await fetchTableSample(t);
      console.log(`Table ${t}: status=${r.status} ok=${r.ok}`);
      console.log('Sample body:', r.body.substring(0, 1000));
    } catch (err) {
      console.error('Error fetching table', t, err.message);
    }
  }

  // Signup two test users with random emails
  const u1 = `test_user_a_${Date.now()}@example.com`;
  const u2 = `test_user_b_${Date.now()}@example.com`;
  const pw = 'Testpass123!';

  console.log('\nSigning up user A:', u1);
  const s1 = await signUp(u1, pw);
  console.log('signup A:', s1.status, s1.ok, JSON.stringify(s1.body).substring(0,1000));

  console.log('\nSigning up user B:', u2);
  const s2 = await signUp(u2, pw);
  console.log('signup B:', s2.status, s2.ok, JSON.stringify(s2.body).substring(0,1000));

  // Extract access_token if available
  const tokenA = s1.body?.access_token || s1.body?.session?.access_token;
  const tokenB = s2.body?.access_token || s2.body?.session?.access_token;
  if (!tokenA || !tokenB) {
    console.warn('Could not obtain access tokens for test users - they may require email confirmation or supabase settings. Tokens:', !!tokenA, !!tokenB);
  } else {
    // Insert a transaction for each user
    const rowA = { id: `a-${Date.now()}`, user_id: s1.body?.user?.id || 'unknown', date: new Date().toISOString().slice(0,10), account: 'checking', type: 'expense', amount: 12.34, category: 'Test', description: 'Inserted by script' };
    console.log('\nInserting transaction for user A with id', rowA.id);
    const insA = await insertTransaction(tokenA, rowA);
    console.log('insert A:', insA.status, insA.ok, JSON.stringify(insA.body).substring(0,1000));

    const rowB = { id: `b-${Date.now()}`, user_id: s2.body?.user?.id || 'unknown', date: new Date().toISOString().slice(0,10), account: 'saving', type: 'income', amount: 99.99, category: 'TestB', description: 'Inserted by script' };
    console.log('\nInserting transaction for user B with id', rowB.id);
    const insB = await insertTransaction(tokenB, rowB);
    console.log('insert B:', insB.status, insB.ok, JSON.stringify(insB.body).substring(0,1000));

    // Query back
    console.log('\nQuerying transactions for user A');
    const qA = await queryTransactionsForUser(tokenA, s1.body?.user?.id || 'unknown');
    console.log('query A:', qA.status, qA.ok, JSON.stringify(qA.body).substring(0,2000));

    console.log('\nQuerying transactions for user B');
    const qB = await queryTransactionsForUser(tokenB, s2.body?.user?.id || 'unknown');
    console.log('query B:', qB.status, qB.ok, JSON.stringify(qB.body).substring(0,2000));
  }

  console.log('\nDone. Note: if signUp did not return tokens, check Supabase auth settings (email confirmations) or use the dashboard to create users.');
})();
