import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const [k,...v]=l.split('=');return [k.trim(),v.join('=').trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const opSources = ['equinix-com','digitalrealty-com','databank-com','cologix-com','coresite-com','cyrusone-com','qtsdatacenters-com'];
console.log('source_records by operator source:');
for (const s of opSources) {
  const { count } = await sb.from('source_records').select('*', { count:'exact', head:true }).eq('source', s);
  console.log(`  ${s.padEnd(22)} ${count}`);
}

const fields = ['code','power_mw','space_sqft','space_sqm','uptime_sla','ups_redundancy','generator_autonomy','min_cabinet_density_kw','site_acres','building_description','security','datasheet_url','certifications','pue','tier'];
console.log('\ndata_centers populated counts:');
for (const f of fields) {
  const { count } = await sb.from('data_centers').select('*', { count:'exact', head:true }).not(f, 'is', null);
  console.log(`  ${f.padEnd(28)} ${count}`);
}

for (const q of ['databank','coresite','cyrusone','qts']) {
  console.log(`\n${q.toUpperCase()} in PeeringDB?`);
  const { data } = await sb.from('data_centers').select('name, operator').or(`name.ilike.%${q}%,operator.ilike.%${q}%`).limit(10);
  for (const r of data ?? []) console.log(`  op="${r.operator}" name="${r.name}"`);
  if (!data?.length) console.log('  (none found)');
}
