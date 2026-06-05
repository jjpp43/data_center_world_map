import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...v]=l.split('=');return [k.trim(),v.join('=').trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
for (const s of ['operational','under_construction','planned','decommissioned']) {
  const { count } = await sb.from('data_centers').select('*', {count:'exact', head:true}).eq('status', s);
  console.log(`${s.padEnd(22)} ${count}`);
}
