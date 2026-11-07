#!/usr/bin/env python3
"""accounts_raw.csv (pin,acct,owner,situs) + centers.csv (pin,lon,lat,area)
-> accounts.csv (pin,acct,owner,situs,lon,lat). A pin split into several
polygons uses the largest piece. Accounts with no polygon are dropped."""
import csv
import sys

accounts_in, centers_in, out = sys.argv[1:4]
centers: dict[str, tuple[float, str, str]] = {}
with open(centers_in, newline="") as f:
    for r in csv.DictReader(f):
        area = float(r["area"] or 0)
        cur = centers.get(r["pin"])
        if cur is None or area > cur[0]:
            centers[r["pin"]] = (area, r["lon"], r["lat"])

kept = dropped = 0
with open(accounts_in, newline="") as f, open(out, "w", newline="") as o:
    w = csv.writer(o)
    w.writerow(["pin", "acct", "owner", "situs", "lon", "lat"])
    for r in csv.DictReader(f):
        c = centers.get(r["pin"])
        if not c:
            dropped += 1
            continue
        w.writerow([r["pin"], r["acct"], r["owner"], r["situs"], c[1], c[2]])
        kept += 1
print(f"search: {kept} accounts located, {dropped} without a parcel polygon", file=sys.stderr)
