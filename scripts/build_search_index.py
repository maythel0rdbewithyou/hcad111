#!/usr/bin/env python3
"""Build the in-browser search index from one or more accounts.csv files.

A single JSON for a whole county would be hundreds of MB, so the index is split
into small shards by the leading characters of each search key. The browser
loads manifest.json once, then only the shard(s) matching what was typed.

Search keys per account: owner name, situs address, street name (address
without the house number), account number and parcel ID. Keys are uppercased,
punctuation removed, spaces written as "_" in shard names.

Shards start at 2 characters (3 if the key starts with a digit) and any shard
bigger than MAX_SHARD_BYTES is split one character deeper, recursively. The
client logic lives in app/src/search.ts.

Shard file: {"r": [[owner, situs, acct, pin, lon, lat], ...]}
"""
import csv
import json
import os
import re
import sys
from collections import defaultdict

MAX_SHARD_BYTES = 350_000
out_dir, meta_json, *inputs = sys.argv[1:]
NON_ALNUM = re.compile(r"[^A-Z0-9 ]+")
WS = re.compile(r"\s+")
HOUSE_NO = re.compile(r"^\d+[A-Z]?\s+")


def norm(s: str) -> str:
    return WS.sub(" ", NON_ALNUM.sub(" ", s.upper())).strip()


def prefix(key: str, n: int) -> str:
    return key[:n].ljust(n, "_").replace(" ", "_")


records: list[list] = []
keys_of: list[set[str]] = []
for path in inputs:
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            records.append([r["owner"], r["situs"], r["acct"], r["pin"], float(r["lon"]), float(r["lat"])])
            situs = norm(r["situs"])
            ks = {norm(r["owner"]), situs, HOUSE_NO.sub("", situs), norm(r["acct"]), norm(r["pin"])}
            keys_of.append({k for k in ks if k})

# Seed groups: shard name -> {record index: [keys of that record under this prefix]}
groups: dict[str, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
for i, ks in enumerate(keys_of):
    for k in ks:
        groups[prefix(k, 3 if k[0].isdigit() else 2)][i].append(k)

size_of = lambda ids: sum(len(json.dumps(records[i])) + 1 for ids_ in [ids] for i in ids_)
final: dict[str, list[int]] = {}
todo = list(groups.items())
while todo:
    name, members = todo.pop()
    if size_of(members) <= MAX_SHARD_BYTES or len(name) >= 12:
        final[name] = list(members)
        continue
    sub: dict[str, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
    for i, ks in members.items():
        for k in ks:
            sub[prefix(k, len(name) + 1)][i].append(k)
    if len(sub) == 1 and next(iter(sub)) == name + "_":  # can't split further
        final[name] = list(members)
        continue
    todo.extend(sub.items())

os.makedirs(out_dir, exist_ok=True)
for fn in os.listdir(out_dir):
    if fn.endswith(".json"):
        os.remove(os.path.join(out_dir, fn))
sizes = []
for name, ids in final.items():
    recs = sorted((records[i] for i in ids), key=lambda x: (x[0], x[1]))
    data = json.dumps({"r": recs}, separators=(",", ":"))
    with open(os.path.join(out_dir, f"{name}.json"), "w") as f:
        f.write(data)
    sizes.append(len(data))

meta = json.load(open(meta_json))
meta.update({"accounts": len(records), "shards": sorted(final)})
with open(os.path.join(out_dir, "manifest.json"), "w") as f:
    json.dump(meta, f, separators=(",", ":"))
sizes.sort()
print(
    f"search index: {len(records)} accounts, {len(final)} shards, "
    f"median {sizes[len(sizes)//2]//1024} KB, max {sizes[-1]//1024} KB, total {sum(sizes)//2**20} MB",
    file=sys.stderr,
)
