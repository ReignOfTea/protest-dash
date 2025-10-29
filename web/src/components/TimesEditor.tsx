import { useMemo, useState } from 'react'
import type { LocationEntry } from './LocationsEditor'

export type TimeEntry = {
    locationId: string
    datetime: string
}

type Props = {
    value: TimeEntry[]
    onChange: (next: TimeEntry[]) => void
    locations: LocationEntry[]
    onCreateLocation: (next: LocationEntry) => void
}

function slugify(input: string): string {
    return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function generateUniqueId(existing: LocationEntry[], location: string, venue: string): string {
    const base = `${slugify(location)}-${slugify(venue)}`
    if (!base) return ''
    let candidate = base
    let i = 2
    const taken = new Set(existing.map(e => e.id))
    while (taken.has(candidate)) { candidate = `${base}-${i++}` }
    return candidate
}

export default function TimesEditor({ value, onChange, locations, onCreateLocation }: Props) {
    const [query, setQuery] = useState('')
    const [headerFilter, setHeaderFilter] = useState('')
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const [creatingForIndex, setCreatingForIndex] = useState<number | null>(null)
    const [draftLoc, setDraftLoc] = useState({ location: '', venue: '', lat: 0, lng: 0 })

    const isValid = useMemo(() => {
        if (!Array.isArray(value) || value.length === 0) return false
        const ids = new Set(locations.map(l => l.id))
        for (const t of value) {
            if (!ids.has(t.locationId)) return false
            if (!t.datetime || Number.isNaN(Date.parse(t.datetime))) return false
        }
        return true
    }, [value, locations])

    const addEntry = () => {
        onChange([...(value || []), { locationId: '', datetime: '' }])
    }

    const removeEntry = (index: number) => onChange(value.filter((_, i) => i !== index))

    const update = (index: number, patch: Partial<TimeEntry>) => {
        const next = value.slice()
        next[index] = { ...next[index], ...patch }
        onChange(next)
    }

    const filtered = useMemo(() => {
        const q = query.toLowerCase()
        if (!q) return locations
        return locations.filter(l =>
            l.id.toLowerCase().includes(q) ||
            l.location.toLowerCase().includes(q) ||
            l.venue.toLowerCase().includes(q)
        )
    }, [locations, query])

    const rowIndices = useMemo(() => {
        const q = headerFilter.toLowerCase()
        return value
          .map((_, i) => i)
          .filter(i => {
            if (!q) return true
            const t = value[i]
            const loc = locations.find(l => l.id === t.locationId)
            const label = `${loc ? `${loc.location} ${loc.venue}` : t.locationId} ${t.datetime}`.toLowerCase()
            return label.includes(q)
          })
          .sort((a, b) => new Date(value[a].datetime).getTime() - new Date(value[b].datetime).getTime())
    }, [value, headerFilter, locations])

    const startCreateLocation = (index: number) => {
        setCreatingForIndex(index)
        setDraftLoc({ location: '', venue: '', lat: 0, lng: 0 })
    }

    const commitCreateLocation = () => {
        if (creatingForIndex === null) return
        const id = generateUniqueId(locations, draftLoc.location, draftLoc.venue)
        const newLoc: LocationEntry = { id, location: draftLoc.location, venue: draftLoc.venue, lat: draftLoc.lat, lng: draftLoc.lng }
        onCreateLocation(newLoc)
        update(creatingForIndex, { locationId: id })
        setCreatingForIndex(null)
        setQuery('')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0 }}>Times</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Filter by location or time…" value={headerFilter} onChange={e => setHeaderFilter(e.target.value)} />
                    <button type="button" onClick={addEntry}>+ Add time</button>
                </div>
            </div>

            {rowIndices.map((idx) => {
                const t = value[idx]
                const selectedLoc = locations.find(l => l.id === t.locationId)
                return (
                    <div key={idx} className="section-card" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: 12, alignItems: 'end' }}>
                        <div>
                            <label style={{ fontWeight: 600 }}>Location</label>
                            <input
                                placeholder="Type to filter…"
                                value={openIndex === idx ? query : (selectedLoc ? `${selectedLoc.location} — ${selectedLoc.venue}` : '')}
                                onChange={e => { setQuery(e.target.value); setOpenIndex(idx) }}
                                onFocus={() => { setQuery(''); setOpenIndex(idx) }}
                                onBlur={() => setTimeout(() => setOpenIndex(current => current === idx ? null : current), 150)}
                                style={{ width: '50ch', maxWidth: '100%' }}
                            />
                            { openIndex === idx && creatingForIndex !== idx && (
                                <div style={{ border: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 10, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
                                    {filtered.map(l => (
                                        <div key={l.id} style={{ padding: 8, cursor: 'pointer' }} onClick={() => { update(idx, { locationId: l.id }); setQuery(''); setOpenIndex(null) }}>
                                            {l.location} — {l.venue}
                                        </div>
                                    ))}
                                    <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
                                        <button type="button" onClick={() => { setOpenIndex(null); startCreateLocation(idx); }}>+ Create new location</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={{ fontWeight: 600 }}>Date & Time</label>
                            <input
                                type="datetime-local"
                                value={t.datetime ? t.datetime.slice(0,16) : ''}
                                onChange={e => update(idx, { datetime: e.target.value })}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => removeEntry(idx)} style={{ background: '#ef4444' }}>Remove</button>
                        </div>

                        {creatingForIndex === idx && (
                            <div className="creating-panel" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginTop: 8 }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontWeight: 600 }}>Location</label>
                                    <input value={draftLoc.location} onChange={e => setDraftLoc({ ...draftLoc, location: e.target.value })} />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontWeight: 600 }}>Venue</label>
                                    <input value={draftLoc.venue} onChange={e => setDraftLoc({ ...draftLoc, venue: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontWeight: 600 }}>Lat</label>
                                    <input type="number" step="any" value={draftLoc.lat} onChange={e => setDraftLoc({ ...draftLoc, lat: Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label style={{ fontWeight: 600 }}>Lng</label>
                                    <input type="number" step="any" value={draftLoc.lng} onChange={e => setDraftLoc({ ...draftLoc, lng: Number(e.target.value) })} />
                                </div>
                                <div style={{ gridColumn: 'span 6', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => setCreatingForIndex(null)} style={{ background: '#374151' }}>Cancel</button>
                                    <button type="button" onClick={commitCreateLocation}>Create & select</button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}

            <div className={isValid ? 'badge-valid' : 'badge-invalid'}>
                {isValid ? 'All entries valid' : 'Choose a valid location and date/time'}
            </div>
        </div>
    )
}


