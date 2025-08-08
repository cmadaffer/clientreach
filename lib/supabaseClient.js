// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Server-side client for API routes (no session persistence)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
