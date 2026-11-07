#!/usr/bin/env python3
"""Clean the Tarrant Appraisal District (TAD) appraisal roll for the parcel join.

Input : PropertyData(Delimited).txt  (pipe-delimited, one row per account)
Output: owners.csv   one row per parcel (GIS_Link), the fields shown in the app
        accounts.csv one row per real-property account (for the search index)

Only real-property accounts are kept (Record type R = residential,
C = commercial). Mineral (M) and business personal property (P / blank) rows
have no parcel polygon of their own.

Some parcels carry several accounts (condos, split improvements). The parcel
shows the account with the highest appraised value, plus how many accounts
share the parcel and their total appraised value. Every account is searchable.
"""
import csv
import re
import sys

src, owners_out, accounts_out = sys.argv[1:4]
ws = re.compile(r"\s+")


def clean(s: str) -> str:
    return ws.sub(" ", s or "").strip()


def money(s: str) -> int:
    try:
        return int(float(s))
    except ValueError:
        return 0


def city_state(s: str) -> str:
    # "FT WORTH ,  TX" -> "FT WORTH, TX"
    return re.sub(r"\s*,\s*", ", ", clean(s))


parcels: dict[str, dict] = {}
year = None
n_accounts = 0
with open(src, newline="", encoding="latin-1") as f, open(
    accounts_out, "w", newline=""
) as af:
    acc_w = csv.writer(af)
    acc_w.writerow(["pin", "acct", "owner", "situs"])
    reader = csv.DictReader(f, delimiter="|", quoting=csv.QUOTE_NONE)
    for row in reader:
        if row["RP"] not in ("R", "C"):
            continue
        pin = clean(row["GIS_Link"])
        if not pin:
            continue
        year = year or row["Appraisal_Year"]
        acct = clean(row["Account_Num"])
        owner = clean(row["Owner_Name"])
        situs = clean(row["Situs_Address"])
        value = money(row["Appraised_Value"]) or money(row["Total_Value"])
        acc_w.writerow([pin, acct, owner, situs])
        n_accounts += 1

        mail = ", ".join(
            p
            for p in (
                clean(row["Owner_Address"]),
                " ".join(x for x in (city_state(row["Owner_CityState"]), clean(row["Owner_Zip"])) if x),
            )
            if p
        )
        rec = {
            "acct": acct,
            "owner": owner,
            "mail": mail,
            "situs": situs,
            "legal": clean(row["LegalDescription"]),
            "value": value,
            "acres": row["Land_Acres"].strip(),
        }
        cur = parcels.get(pin)
        if cur is None:
            rec["n"] = 1
            rec["tval"] = value
            parcels[pin] = rec
        else:
            n, tval = cur["n"] + 1, cur["tval"] + value
            if (value, -int(acct or 0)) > (cur["value"], -int(cur["acct"] or 0)):
                parcels[pin] = rec
                cur = rec
            cur["n"], cur["tval"] = n, tval

cols = ["pin", "acct", "owner", "mail", "situs", "legal", "value", "acres", "n", "tval"]
with open(owners_out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for pin, r in parcels.items():
        w.writerow([pin] + [r[c] for c in cols[1:]])

# CSVT sidecar so GDAL reads proper types
with open(owners_out[:-4] + ".csvt", "w") as f:
    f.write('"String","String","String","String","String","String","Integer64","Real","Integer","Integer64"\n')

print(f"roll year {year}: {n_accounts} real-property accounts on {len(parcels)} parcels", file=sys.stderr)
print(year or "")
