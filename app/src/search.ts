import { SEARCH_BASE_URL } from './config';

// Must match scripts/build_search_index.py
export interface SearchHit {
  owner: string;
  situs: string;
  acct: string;
  pin: string;
  lon: number;
  lat: number;
  score: number;
}
type Row = [string, string, string, string, number, number];
interface Manifest { shards: string[]; built: string; sources: string; accounts: number }

const NON_ALNUM = /[^A-Z0-9 ]+/g;
const HOUSE_NO = /^\d+[A-Z]?\s+/;
export const norm = (s: string) => s.toUpperCase().replace(NON_ALNUM, ' ').replace(/\s+/g, ' ').trim();

let manifest: Promise<Manifest> | null = null;
const shardCache = new Map<string, Promise<Row[]>>();

export function loadManifest(): Promise<Manifest> {
  manifest ??= fetch(`${SEARCH_BASE_URL}/index.json`).then((r) => {
    if (!r.ok) throw new Error(`search index missing (${r.status})`);
    return r.json();
  });
  return manifest;
}

function loadShard(name: string): Promise<Row[]> {
  let p = shardCache.get(name);
  if (!p) {
    p = fetch(`${SEARCH_BASE_URL}/${name}.json`)
      .then((r) => (r.ok ? r.json() : { r: [] }))
      .then((j) => j.r as Row[]);
    shardCache.set(name, p);
  }
  return p;
}

export interface SearchResult { hits: SearchHit[]; needMore: boolean }

/**
 * Pick the shard(s) for a query. Shards are key prefixes of varying length
 * (big ones were split deeper by the build script). If the query is longer
 * than a shard name that prefixes it, that shard holds every match. If the
 * query is shorter than the split depth, load the few sub-shards it covers,
 * or ask the user to keep typing when there are too many.
 */
function shardsFor(q: string, shards: string[]): string[] | null {
  const k = q.replace(/ /g, '_');
  let best = '';
  for (const s of shards) if (k.startsWith(s) && s.length > best.length) best = s;
  if (best) return [best];
  const under = shards.filter((s) => s.startsWith(k));
  return under.length <= 6 ? under : null;
}

/** Search owner name, address, street name, account number or parcel ID. */
export async function search(query: string, limit = 25): Promise<SearchResult> {
  const q = norm(query);
  if (q.length < 2) return { hits: [], needMore: true };
  const m = await loadManifest();
  const names = shardsFor(q, m.shards);
  if (!names) return { hits: [], needMore: true };
  const rows = (await Promise.all(names.map(loadShard))).flat();
  const words = q.split(' ');
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const [owner, situs, acct, pin, lon, lat] of rows) {
    if (seen.has(acct)) continue;
    seen.add(acct);
    const o = norm(owner), s = norm(situs), a = norm(acct), p = norm(pin);
    let score = 0;
    if (a === q || p === q) score = 100;
    else if (s === q || o === q) score = 90;
    else if (s.startsWith(q)) score = 80;
    else if (o.startsWith(q)) score = 70;
    else if (s.replace(HOUSE_NO, '').startsWith(q)) score = 60;
    else if (a.startsWith(q) || p.startsWith(q)) score = 50;
    // every typed word appears somewhere, e.g. "smith john" vs "SMITH, JOHN A"
    else if (words.every((w) => o.includes(w) || s.includes(w))) score = 20;
    if (score) hits.push({ owner, situs, acct, pin, lon, lat, score });
  }
  hits.sort((x, y) => y.score - x.score || x.situs.localeCompare(y.situs, undefined, { numeric: true }));
  return { hits: hits.slice(0, limit), needMore: false };
}
