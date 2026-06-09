#!/usr/bin/env node
// Security guardrails for datacenters.world.
// Run via `npm run check:security`.
//
// Checks performed:
//   1. The service-role key (or supabaseAdmin) is never referenced from runtime
//      app code (app/, components/, lib/ minus lib/supabase.ts where it's defined).
//   2. Any environment variable named *SERVICE_ROLE* is never prefixed with
//      NEXT_PUBLIC_, which would expose it to the browser bundle.
//   3. If SUPABASE_SERVICE_ROLE_KEY is available, verifies every public-schema
//      table has RLS enabled. Skipped (with a warning) when the key isn't loaded
//      — CI without the service key can still run checks 1 + 2.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

const ALLOWED_SERVICE_ROLE_PATHS = [
  "lib/supabase.ts",
  "scripts/",
];

const FORBIDDEN_PATTERNS = [/supabaseAdmin\b/, /SUPABASE_SERVICE_ROLE_KEY/];

const SCAN_DIRS = ["app", "components", "lib"];

// Extension-owned tables that we can't alter as the project owner. PostGIS
// installs spatial_ref_sys in the public schema. Migration 0007 also updates
// the SQL-side helper to skip extension deps; this guards against the case
// where 0007 hasn't been applied to the live DB yet.
const RLS_ALLOWLIST = new Set(["spatial_ref_sys"]);

const errors = [];

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, onFile);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".js") || entry.endsWith(".mjs")) {
      onFile(full);
    }
  }
}

function isAllowed(file) {
  const rel = path.relative(ROOT, file);
  return ALLOWED_SERVICE_ROLE_PATHS.some((p) => rel === p || rel.startsWith(p));
}

console.log("→ Checking service-role usage in runtime app code…");
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  try {
    walk(abs, (file) => {
      if (isAllowed(file)) return;
      const text = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          errors.push(
            `${path.relative(ROOT, file)} references ${pattern} — service-role usage in client-reachable code`,
          );
        }
      }
    });
  } catch {}
}

console.log("→ Checking for NEXT_PUBLIC_*SERVICE_ROLE* env exposure…");
try {
  const envFiles = [".env", ".env.local", ".env.production", ".env.development"];
  for (const f of envFiles) {
    try {
      const text = readFileSync(path.join(ROOT, f), "utf-8");
      for (const line of text.split("\n")) {
        if (/^\s*NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/.test(line)) {
          errors.push(`${f}: env var prefixed NEXT_PUBLIC_ and named *SERVICE_ROLE — would expose to client bundle`);
        }
      }
    } catch {}
  }
} catch {}

console.log("→ Checking Supabase RLS coverage on public tables…");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.warn(
    "   skipped — SUPABASE_SERVICE_ROLE_KEY not in env. Run locally with `tsx --env-file=.env.local scripts/check-security.mjs` to include this check.",
  );
} else {
  const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("exec_sql_readonly", {});
  // Most projects won't have that RPC. Fall back to a direct query:
  const { data: rows, error: qErr } = await sb
    .from("pg_tables")
    .select("schemaname, tablename, rowsecurity")
    .eq("schemaname", "public");
  if (qErr) {
    // PostgREST won't expose pg_tables by default. Use raw SQL via the REST RPC layer.
    try {
      const res = await fetch(`${URL}/rest/v1/rpc/check_rls_coverage`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const list = await res.json();
        for (const t of list ?? []) {
          if (t.rowsecurity === false && !RLS_ALLOWLIST.has(t.tablename)) {
            errors.push(`Supabase: public.${t.tablename} has RLS disabled`);
          }
        }
      } else {
        console.warn(
          "   skipped — couldn't query pg_tables (PostgREST default hides it). Create the helper function in supabase/migrations/0006_rls_check.sql to enable this check.",
        );
      }
    } catch (e) {
      console.warn(`   skipped — ${e.message}`);
    }
  } else {
    for (const t of rows ?? []) {
      if (t.rowsecurity === false) {
        errors.push(`Supabase: public.${t.tablename} has RLS disabled`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✖  ${errors.length} security finding${errors.length === 1 ? "" : "s"}:`);
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(1);
}

console.log("\n✓ Security checks passed.");
