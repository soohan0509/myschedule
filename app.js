import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const ENV = window.__ENV || {};

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const NEIS_API_KEY = ENV.NEIS_API_KEY;
export const NEIS_ATPT_CODE = ENV.NEIS_ATPT_CODE;
export const NEIS_SCHOOL_CODE = ENV.NEIS_SCHOOL_CODE;

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}
