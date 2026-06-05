import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { request } from "undici";

// Overpass's Apache + mod_security rejects User-Agents containing a
// parenthesized URL like "(+https://...)" with 406. We keep the brief's
// identifier but drop the URL fragment so the same UA works everywhere;
// the contact URL goes in a separate `from` header for the Overpass call.
const USER_AGENT = "DataCenterMapBot/0.1";
const CACHE_ROOT = join(process.cwd(), "cache");

export interface FetchOptions {
  /** Sub-directory under ./cache/ for this source */
  cacheNamespace: string;
  /** Stable cache key (e.g. `peeringdb-fac-skip-0`) */
  cacheKey: string;
  /** Skip cache and force a fresh request */
  noCache?: boolean;
  /** Override the default request headers */
  headers?: Record<string, string>;
  /** HTTP method, defaults to GET */
  method?: "GET" | "POST";
  /** Request body for POST */
  body?: string;
  /** Max retries on 5xx / network errors */
  maxRetries?: number;
  /** Backoff schedule in ms — defaults to [1000, 2000, 4000] */
  backoffMs?: number[];
}

export interface FetchResult {
  status: number;
  body: string;
  fromCache: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cacheFilePath(namespace: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (safe.length <= 120) return join(CACHE_ROOT, namespace, `${safe}.cache`);
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 12);
  return join(CACHE_ROOT, namespace, `${safe.slice(0, 100)}_${hash}.cache`);
}

async function readCache(path: string): Promise<string | null> {
  try {
    await stat(path);
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeCache(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

/**
 * Cached, retrying HTTP client.
 *
 * - Caches successful 2xx responses to ./cache/<namespace>/<key>.cache
 * - Retries 5xx and network errors with exponential backoff
 * - Sets a clear User-Agent
 */
export async function cachedFetch(url: string, opts: FetchOptions): Promise<FetchResult> {
  const cachePath = cacheFilePath(opts.cacheNamespace, opts.cacheKey);

  if (!opts.noCache) {
    const cached = await readCache(cachePath);
    if (cached !== null) {
      return { status: 200, body: cached, fromCache: true };
    }
  }

  const backoff = opts.backoffMs ?? [1000, 2000, 4000];
  const maxRetries = opts.maxRetries ?? backoff.length;
  let lastErr: unknown = null;

  let currentUrl = url;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res = await request(currentUrl, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json, text/html;q=0.9, */*;q=0.5",
          ...opts.headers,
        },
        bodyTimeout: 60_000,
        headersTimeout: 30_000,
      });

      // Follow redirects up to 5 hops (undici's `request` doesn't auto-follow).
      // Drain the body fully before issuing the next request — calling
      // body.destroy() across many redirects races with undici's internal
      // pool and surfaces as UND_ERR_ABORTED on some hosts (seen on
      // cyrusone.com which 301s to add a trailing slash).
      let hops = 0;
      while (res.statusCode >= 300 && res.statusCode < 400 && hops < 5) {
        const loc = res.headers["location"];
        if (!loc) break;
        const next = Array.isArray(loc) ? loc[0] : loc;
        if (!next) break;
        currentUrl = new URL(next, currentUrl).toString();
        await res.body.text().catch(() => "");
        res = await request(currentUrl, {
          method: opts.method ?? "GET",
          body: opts.body,
          headers: {
            "user-agent": USER_AGENT,
            accept: "application/json, text/html;q=0.9, */*;q=0.5",
            ...opts.headers,
          },
          bodyTimeout: 60_000,
          headersTimeout: 30_000,
        });
        hops++;
      }

      const body = await res.body.text();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await writeCache(cachePath, body);
        return { status: res.statusCode, body, fromCache: false };
      }

      // 429: Too Many Requests — honor Retry-After if provided.
      if (res.statusCode === 429 && attempt < maxRetries) {
        const retryAfterHeader = res.headers["retry-after"];
        const retryAfter = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
        const parsedSec = retryAfter ? Number(retryAfter) : NaN;
        const baseWait = backoff[Math.min(attempt, backoff.length - 1)] ?? 4000;
        const wait = Number.isFinite(parsedSec) && parsedSec > 0 ? parsedSec * 1000 + 500 : Math.max(baseWait, 60_000);
        process.stderr.write(`[http] 429 ${currentUrl} — backing off ${wait}ms (attempt ${attempt + 1}/${maxRetries})\n`);
        await sleep(wait);
        continue;
      }

      if (res.statusCode >= 500 && attempt < maxRetries) {
        const wait = backoff[Math.min(attempt, backoff.length - 1)] ?? 4000;
        process.stderr.write(`[http] ${res.statusCode} ${currentUrl} — retry in ${wait}ms\n`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.statusCode} for ${currentUrl}: ${body.slice(0, 200)}`);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const wait = backoff[Math.min(attempt, backoff.length - 1)] ?? 4000;
        process.stderr.write(`[http] error on ${currentUrl}: ${(err as Error).message} — retry in ${wait}ms\n`);
        await sleep(wait);
        continue;
      }
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}
