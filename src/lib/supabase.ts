import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SESSION_KEY = 'nycdev_session_id';

function getOrCreateSessionId(): string {
  if (typeof localStorage === 'undefined') return crypto.randomUUID();
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export const sessionId = getOrCreateSessionId();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      'x-session-id': sessionId,
    },
  },
});
