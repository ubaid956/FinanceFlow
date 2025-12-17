import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !serviceRole) {
  // Intentionally throw at import time so server startup fails early if secrets missing
  throw new Error('Missing SUPABASE_SERVICE_ROLE or SUPABASE_URL in server environment');
}

export const supabaseAdmin = createClient(url, serviceRole, {
  auth: { persistSession: false }
});
