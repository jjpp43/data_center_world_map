import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...v]=l.split('=');return [k.trim(),v.join('=').trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { count: deTotal } = await sb.from('data_centers').select('*', {count:'exact', head:true}).eq('country','DE');
console.log(`Germany facilities: ${deTotal}`);

const { data: byOp } = await sb.from('data_centers').select('operator').eq('country','DE').limit(10000);
const opCounts = {};
for (const r of byOp ?? []) opCounts[r.operator || '(none)'] = (opCounts[r.operator || '(none)'] || 0) + 1;
console.log('\nTop 25 DE operators:');
for (const [op,n] of Object.entries(opCounts).sort((a,b)=>b[1]-a[1]).slice(0,25)) console.log(`  ${n.toString().padStart(4)} ${op}`);

const fields = ['power_mw','space_sqft','pue','tier','ups_redundancy','uptime_sla'];
console.log('\nDE spec populated counts:');
for (const f of fields) {
  const { count } = await sb.from('data_centers').select('*', {count:'exact', head:true}).eq('country','DE').not(f, 'is', null);
  console.log(`  ${f.padEnd(20)} ${count}`);
}
