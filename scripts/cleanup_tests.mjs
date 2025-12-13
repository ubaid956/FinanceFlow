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

// Test users (must match the ones used to insert records)
const users = [
  { email: 'tayyabbusinesses0@gmail.com', password: 'Ub@id301' },
  { email: 'ertugralghazi451@gmail.com', password: 'Ub@id301' },
];

// Known test record IDs to remove (from the verification runs)
const idsToDelete = [
  'test-1765585927481-kqkosi',
  'test-1765585983786-eajb1q',
  'test-1765586025581-xqq1de',
  'test-1765585985206-ermh0c',
  'test-1765586026786-ijsb7k',
];

async function signIn(email, password) {
  const url = `${SUPA_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
}

async function deleteById(accessToken, id) {
  const url = `${SUPA_URL}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'return=representation'
    }
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

(async () => {
  console.log('Using Supabase URL:', SUPA_URL);

  // Sign in first user to get token
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

    // Find rows created by our script for this user (description field is unique to the script)
    try {
      const selectUrl = `${SUPA_URL}/rest/v1/transactions?select=*&description=eq.${encodeURIComponent('Inserted by supacheck_signin')}&user_id=eq.${encodeURIComponent(userId)}`;
      const res = await fetch(selectUrl, { headers: { apikey: SUPA_KEY, 'Authorization': `Bearer ${token}` } });
      const rows = await res.json().catch(() => null);
      console.log('Found', Array.isArray(rows) ? rows.length : 'unknown', 'script rows for user', u.email);
      if (Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          try {
            console.log('Deleting row id', row.id, 'for user', u.email);
            const d = await deleteById(token, row.id);
            console.log('Delete status:', d.status, 'ok=', d.ok, 'body=', JSON.stringify(d.body));
          } catch (err) {
            console.error('Delete error for', row.id, err.message);
          }
        }
      }
    } catch (err) {
      console.error('Failed to query script rows for user', u.email, err.message);
    }
  }

  console.log('\nCleanup script finished.');
})();
