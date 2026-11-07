import { useEffect, useRef, useState } from 'react';
import { search, type SearchHit } from './search';

export function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    if (q.trim().length < 2) { setHits([]); setStatus(null); return; }
    setStatus('Searching…');
    const t = setTimeout(() => {
      search(q)
        .then(({ hits: h, needMore }) => {
          if (id !== seq.current) return;
          setHits(h); setActive(0);
          setStatus(h.length ? null : needMore ? 'Keep typing…' : 'No matches');
        })
        .catch((e) => id === seq.current && setStatus(String(e.message ?? e)));
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (h: SearchHit) => { onPick(h); setOpen(false); };

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Search address, owner, or parcel / account ID"
        aria-label="Search parcels"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setActive((a) => Math.min(a + 1, hits.length - 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setActive((a) => Math.max(a - 1, 0)); e.preventDefault(); }
          else if (e.key === 'Enter' && hits[active]) pick(hits[active]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (hits.length > 0 || status) && (
        <ul className="results" role="listbox">
          {status && <li className="status">{status}</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.acct}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActive(i)}
            >
              <div className="r-main">{h.situs || '(no address)'}</div>
              <div className="r-sub">{h.owner} · <span className="mono">{h.pin}</span></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
