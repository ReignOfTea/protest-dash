import { useMemo, useState } from 'react'

export type LocationEntry = {
    id: string
    location: string
    venue: string
    lat: number
    lng: number
}

type Props = {
    value: LocationEntry[]
    onChange: (next: LocationEntry[]) => void
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function generateUniqueId(entries: LocationEntry[], baseLocation: string, baseVenue: string, selfIndex: number): string {
    const base = `${slugify(baseLocation)}-${slugify(baseVenue)}`
    if (!base) return ''
    let candidate = base
    let i = 2
    const taken = new Set(entries.map((e, idx) => (idx === selfIndex ? '' : e.id)))
    while (taken.has(candidate)) {
        candidate = `${base}-${i}`
        i++
    }
    return candidate
}

export default function LocationsEditor({ value, onChange }: Props) {
    const [query, setQuery] = useState('')
    const isValid = useMemo(() => {
        if (!Array.isArray(value) || value.length === 0) return false
        const ids = new Set<string>()
        for (const e of value) {
            if (!e.location?.trim() || !e.venue?.trim()) return false
            if (typeof e.lat !== 'number' || typeof e.lng !== 'number') return false
            if (Number.isNaN(e.lat) || Number.isNaN(e.lng)) return false
            if (e.lat < -90 || e.lat > 90) return false
            if (e.lng < -180 || e.lng > 180) return false
            if (!e.id?.trim()) return false
            if (ids.has(e.id)) return false
            ids.add(e.id)
        }
        return true
    }, [value])

    const update = (index: number, patch: Partial<LocationEntry>) => {
        const next = value.slice()
        const current = next[index]
        const updated: LocationEntry = { ...current, ...patch }

        // Auto-generate id when location or venue changes
        if ('location' in patch || 'venue' in patch) {
            const autoId = generateUniqueId(next, updated.location, updated.venue, index)
            updated.id = autoId
        }
        next[index] = updated
        onChange(next)
    }

    const addEntry = () => {
        const draft: LocationEntry = { id: '', location: '', venue: '', lat: 0, lng: 0 }
        const withDraft = [...value, draft]
        // generate id using empty fields results in '', keep until user types
        onChange(withDraft)
    }

    const removeEntry = (index: number) => {
        onChange(value.filter((_, i) => i !== index))
    }

    const indices = useMemo(() => {
        const q = query.toLowerCase()
        return value
            .map((_, i) => i)
            .filter(i => {
                const e = value[i]
                const text = `${e.location} ${e.venue} ${e.id}`.toLowerCase()
                return !q || text.includes(q)
            })
            .sort((a, b) => {
                const ea = value[a]
                const eb = value[b]
                const la = (ea.location || '').localeCompare(eb.location || '');
                return la !== 0 ? la : (ea.venue || '').localeCompare(eb.venue || '')
            })
    }, [value, query])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0 }}>Locations</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Filter…" value={query} onChange={e => setQuery(e.target.value)} />
                    <button type="button" onClick={addEntry}>+ Add location</button>
                </div>
            </div>
            {indices.map((idx) => {
                const e = value[idx]
                return (
                <div key={idx} className="section-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, alignItems: 'end' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontWeight: 600 }}>Location</label>
                        <input value={e.location} onChange={ev => update(idx, { location: ev.target.value })} placeholder="Location" />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontWeight: 600 }}>Venue</label>
                        <input value={e.venue} onChange={ev => update(idx, { venue: ev.target.value })} placeholder="Venue" />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600 }}>Lat</label>
                        <input
                            value={e.lat}
                            onChange={ev => update(idx, { lat: Number(ev.target.value) })}
                            placeholder="Latitude"
                            type="number"
                            step="any"
                        />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600 }}>Lng</label>
                        <input
                            value={e.lng}
                            onChange={ev => update(idx, { lng: Number(ev.target.value) })}
                            placeholder="Longitude"
                            type="number"
                            step="any"
                        />
                    </div>
                    <div style={{ gridColumn: 'span 5' }}>
                        <label style={{ fontWeight: 600 }}>ID (auto)</label>
                        <input value={e.id} readOnly />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => removeEntry(idx)} style={{ background: '#ef4444' }}>Remove</button>
                    </div>
                </div>
            )})}
            <div className={isValid ? 'badge-valid' : 'badge-invalid'}>
                {isValid ? 'All entries valid' : 'Invalid IDs, coordinates, or missing fields'}
            </div>
        </div>
    )
}


