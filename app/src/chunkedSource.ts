import type { Source, RangeResponse } from 'pmtiles';

/**
 * A PMTiles Source that reads one archive split into fixed-size chunk files
 * (parcels.pmtiles is ~200 MB, but static hosts like Cloudflare Pages cap files
 * at 25 MiB). scripts/split_pmtiles.py writes the chunks plus manifest.json:
 *   { "size": <total bytes>, "chunkSize": <bytes>, "parts": ["000.bin", ...] }
 * Each read becomes HTTP Range request(s) on the chunk(s) it overlaps. If a host
 * ignores Range and returns the whole chunk, that chunk is kept in memory.
 */
interface Manifest { size: number; chunkSize: number; parts: string[] }

export class ChunkedSource implements Source {
  private baseUrl: string;
  private manifest: Promise<Manifest>;
  private whole = new Map<number, Promise<ArrayBuffer>>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.manifest = fetch(`${baseUrl}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`parcel tiles manifest missing (${r.status})`);
      return r.json();
    });
  }

  getKey() {
    return this.baseUrl;
  }

  private async readPart(m: Manifest, idx: number, start: number, end: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    const cached = this.whole.get(idx);
    if (cached) return (await cached).slice(start, end);
    const url = `${this.baseUrl}/${m.parts[idx]}`;
    const r = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` }, signal });
    if (r.status === 206) return r.arrayBuffer();
    if (r.status === 200) {
      const buf = r.arrayBuffer();
      this.whole.set(idx, buf);
      return (await buf).slice(start, end);
    }
    throw new Error(`tile chunk ${url}: HTTP ${r.status}`);
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const m = await this.manifest;
    const end = Math.min(offset + length, m.size);
    const pieces: Promise<ArrayBuffer>[] = [];
    for (let pos = offset; pos < end; ) {
      const idx = Math.floor(pos / m.chunkSize);
      const partStart = idx * m.chunkSize;
      const partEnd = Math.min(end, partStart + m.chunkSize);
      pieces.push(this.readPart(m, idx, pos - partStart, partEnd - partStart, signal));
      pos = partEnd;
    }
    const bufs = await Promise.all(pieces);
    if (bufs.length === 1) return { data: bufs[0] };
    const out = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0));
    let o = 0;
    for (const b of bufs) { out.set(new Uint8Array(b), o); o += b.byteLength; }
    return { data: out.buffer };
  }
}
