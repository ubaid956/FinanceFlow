import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// const supabaseUrl = 'https://jfynuyrpuqpkrazxwelm.supabase.co';
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmeW51eXJwdXFwa3Jhenh3ZWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1ODMxMjMsImV4cCI6MjA4MTE1OTEyM30.lVyGogCWoVsct7tDfjxm8XpOqGgcZogfF9Qjyk91BLk';

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or key. Please check your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
