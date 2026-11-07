#!/usr/bin/env python3
"""Split a .pmtiles archive into fixed-size chunk files + manifest.json so it can
be served from a static host with a per-file size limit (Cloudflare Pages: 25 MiB).
Read back in the browser by app/src/chunkedSource.ts.

usage: split_pmtiles.py parcels.pmtiles OUT_DIR [chunk MiB, default 8]
"""
import json
import os
import sys

src, out_dir = sys.argv[1:3]
chunk = int(float(sys.argv[3]) * 2**20) if len(sys.argv) > 3 else 8 * 2**20
os.makedirs(out_dir, exist_ok=True)
for fn in os.listdir(out_dir):
    os.remove(os.path.join(out_dir, fn))
parts = []
with open(src, "rb") as f:
    while data := f.read(chunk):
        name = f"{len(parts):03d}.bin"
        with open(os.path.join(out_dir, name), "wb") as o:
            o.write(data)
        parts.append(name)
size = os.path.getsize(src)
with open(os.path.join(out_dir, "manifest.json"), "w") as f:
    json.dump({"size": size, "chunkSize": chunk, "parts": parts}, f)
print(f"split {size/2**20:.0f} MiB into {len(parts)} x {chunk/2**20:.0f} MiB chunks", file=sys.stderr)
