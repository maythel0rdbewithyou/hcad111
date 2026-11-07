import type { ParcelProps } from './parcelLayers';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value}</dd>
    </div>
  );
}

export function ParcelPanel({ parcel, onClose }: { parcel: ParcelProps; onClose: () => void }) {
  const acres = parcel.acres !== undefined && parcel.acres !== '' ? Number(parcel.acres) : undefined;
  return (
    <aside className="panel" aria-label="Parcel details">
      <header>
        <div>
          <div className="eyebrow">{parcel.county ?? 'Parcel'}</div>
          <h2>{parcel.owner || 'Owner not on record'}</h2>
          {parcel.situs && <div className="sub">{parcel.situs}</div>}
        </div>
        <button className="close" onClick={onClose} aria-label="Close panel">×</button>
      </header>
      <dl>
        <Row label="Owner" value={parcel.owner} />
        <Row label="Mailing address" value={parcel.mail} />
        <Row label="Property address" value={parcel.situs} />
        <Row label="Parcel ID" value={parcel.pin} mono />
        <Row label="Account #" value={parcel.acct} mono />
        <Row label="Acreage" value={acres !== undefined && !Number.isNaN(acres) ? `${acres.toLocaleString(undefined, { maximumFractionDigits: 4 })} ac` : undefined} />
        <Row label="Appraised value" value={parcel.value !== undefined ? usd.format(parcel.value) : undefined} />
        {parcel.n && parcel.n > 1 ? (
          <Row
            label="Accounts on parcel"
            value={`${parcel.n} accounts (showing highest value)${parcel.tval ? ` · total ${usd.format(parcel.tval)}` : ''}`}
          />
        ) : null}
        <Row label="Legal description" value={parcel.legal} />
      </dl>
      {!parcel.acct && <p className="note">No appraisal-roll account matched this parcel polygon.</p>}
    </aside>
  );
}
