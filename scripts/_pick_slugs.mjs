import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...v]=l.split('=');return [k.trim(),v.join('=').trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const cases = [
  ['Equinix NY5 (rich)',  { operator:'Equinix, Inc.', name_like:'%NY5%' }],
  ['DR with security',     { operator:'Digital Realty', security_not_null: true }],
  ['DataBank power_mw',    { operator:'DataBank, Ltd.', power_mw_not_null: true }],
  ['Sparse PeeringDB-only', { source:'peeringdb_only' }],
];
for (const [label, q] of cases) {
  let req = sb.from('data_centers').select('slug, name, operator, code, power_mw, space_sqft, ups_redundancy, security').limit(1);
  if (q.operator) req = req.eq('operator', q.operator);
  if (q.name_like) req = req.ilike('name', q.name_like);
  if (q.security_not_null) req = req.not('security','is',null);
  if (q.power_mw_not_null) req = req.not('power_mw','is',null);
  if (q.source === 'peeringdb_only') req = req.is('code', null).is('ups_redundancy', null).is('security', null).limit(1);
  const { data } = await req;
  console.log(`${label}: ${data?.[0]?.slug ?? 'none'} — ${data?.[0]?.name ?? ''}`);
}
