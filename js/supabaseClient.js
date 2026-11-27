import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xdumjugwljbaelljgqnf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6Fzz96XXHOpLGegNBP5HRQ_hf8wUtnt';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);