import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...v]=l.split('=');return [k.trim(),v.join('=').trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { count: usTotal } = await sb.from('data_centers').select('*', {count:'exact', head:true}).eq('country','US');
console.log(`US facilities total: ${usTotal}`);

const { data: byOp } = await sb.from('data_centers').select('operator').eq('country','US').limit(10000);
const opCounts = {};
for (const r of byOp ?? []) opCounts[r.operator || '(none)'] = (opCounts[r.operator || '(none)'] || 0) + 1;
console.log(`\nTop 20 US operators:`);
const sorted = Object.entries(opCounts).sort((a,b)=>b[1]-a[1]).slice(0,20);
for (const [op,n] of sorted) console.log(`  ${n.toString().padStart(4)} ${op}`);

const { count: usPdb }  = await sb.from('source_records').select('source_records.*, data_centers!inner(country)', {count:'exact', head:true}).eq('source','peeringdb').eq('data_centers.country','US');
console.log(`\nUS via peeringdb source: ${usPdb}`);
