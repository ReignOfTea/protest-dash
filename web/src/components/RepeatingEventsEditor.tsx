import { useMemo, useState } from 'react'
import type { LocationEntry } from './LocationsEditor'

export type RepeatingEvent = {
    name: string
    locationId: string
    weekday: number // 0=Sun..6=Sat
    time: string // HH:mm:ss
    enabled: boolean
    created: string
    excludedDates: string[] // YYYY-MM-DD
}

type Props = {
    value: RepeatingEvent[]
    onChange: (next: RepeatingEvent[]) => void
    locations: LocationEntry[]
    onCreateLocation: (next: LocationEntry) => void
}

function pad(n: number): string { return String(n).padStart(2, '0') }

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

export default function RepeatingEventsEditor({ value, onChange, locations, onCreateLocation }: Props) {
    const [query, setQuery] = useState('')
    const [headerFilter, setHeaderFilter] = useState('')
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const [creatingForIndex, setCreatingForIndex] = useState<number | null>(null)
    const [draftLoc, setDraftLoc] = useState({ location: '', venue: '', lat: 0, lng: 0 })

    const isValid = useMemo(() => {
        if (!Array.isArray(value)) return false
        const ids = new Set(locations.map(l => l.id))
        return value.every(ev => ev.name?.trim() && ids.has(ev.locationId) && ev.time && ev.weekday >= 0 && ev.weekday <= 6)
    }, [value, locations])

    const addEvent = () => {
        const now = new Date().toISOString()
        onChange([...(value || []), { name: '', locationId: '', weekday: 0, time: '18:00:00', enabled: true, created: now, excludedDates: [] }])
    }

    const removeEvent = (index: number) => onChange(value.filter((_, i) => i !== index))

    const update = (index: number, patch: Partial<RepeatingEvent>) => {
        const next = value.slice()
        next[index] = { ...next[index], ...patch }
        onChange(next)
    }

    const filtered = useMemo(() => {
        const q = query.toLowerCase(); if (!q) return locations
        return locations.filter(l => l.id.toLowerCase().includes(q) || l.location.toLowerCase().includes(q) || l.venue.toLowerCase().includes(q))
    }, [locations, query])

    const startCreateLocation = (index: number) => { setCreatingForIndex(index); setDraftLoc({ location: '', venue: '', lat: 0, lng: 0 }) }
    const commitCreateLocation = () => {
        if (creatingForIndex === null) return
        const id = generateUniqueId(locations, draftLoc.location, draftLoc.venue)
        const newLoc: LocationEntry = { id, location: draftLoc.location, venue: draftLoc.venue, lat: draftLoc.lat, lng: draftLoc.lng }
        onCreateLocation(newLoc)
        update(creatingForIndex, { locationId: id })
        setCreatingForIndex(null); setQuery('')
    }

    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    const rowIndices = useMemo(() => {
        const q = headerFilter.toLowerCase()
        const labelFor = (ev: RepeatingEvent) => {
            const loc = locations.find(l => l.id === ev.locationId)
            const locLabel = loc ? `${loc.location} ${loc.venue}` : ev.locationId
            return `${ev.name} ${locLabel} ${ev.time} ${ev.weekday}`.toLowerCase()
        }
        return value
            .map((_, i) => i)
            .filter(i => !q || labelFor(value[i]).includes(q))
            .sort((a, b) => {
                const ea = value[a]; const eb = value[b]
                // Sort by weekday then time then name
                if (ea.weekday !== eb.weekday) return ea.weekday - eb.weekday
                return ea.time.localeCompare(eb.time) || ea.name.localeCompare(eb.name)
            })
    }, [value, headerFilter, locations])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0 }}>Repeating Events</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Filter…" value={headerFilter} onChange={e => setHeaderFilter(e.target.value)} />
                    <button type="button" onClick={addEvent}>+ Add schedule</button>
                </div>
            </div>
            {rowIndices.map((idx) => {
                const ev = value[idx]
                const selectedLoc = locations.find(l => l.id === ev.locationId)
                return (
                    <div key={idx} className="section-card" style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                        <div>
                            <label style={{ fontWeight: 600 }}>Name</label>
                            <input value={ev.name} onChange={e => update(idx, { name: e.target.value })} placeholder="Schedule name" />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600 }}>Location</label>
                            <input
                                placeholder="Type to filter..."
                                value={openIndex === idx ? query : (selectedLoc ? `${selectedLoc.location} — ${selectedLoc.venue}` : '')}
                                onChange={e => { setQuery(e.target.value); setOpenIndex(idx) }}
                                onFocus={() => { setQuery(''); setOpenIndex(idx) }}
                                onBlur={() => setTimeout(() => setOpenIndex(current => current === idx ? null : current), 150)}
                                style={{ width: '50ch', maxWidth: '100%' }}
                            />
                            {openIndex === idx && creatingForIndex !== idx && (
                                <div style={{ border: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 10, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
                                    {filtered.map(l => (
                                        <div key={l.id} style={{ padding: 8, cursor: 'pointer' }} onClick={() => { update(idx, { locationId: l.id }); setQuery(''); setOpenIndex(null) }}>
                                            {l.location} — {l.venue}
                                        </div>
                                    ))}
                                    <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
                                        <button type="button" onClick={() => { setOpenIndex(null); startCreateLocation(idx) }}>+ Create new location</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={{ fontWeight: 600 }}>Weekday</label>
                            <select value={ev.weekday} onChange={e => update(idx, { weekday: Number(e.target.value) })}>
                                {weekdays.map((w, i) => (<option key={i} value={i}>{w}</option>))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: 600 }}>Time</label>
                            <input type="time" step="1" value={ev.time} onChange={e => update(idx, { time: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <label>
                                <input type="checkbox" checked={ev.enabled} onChange={e => update(idx, { enabled: e.target.checked })} /> Enabled
                            </label>
                            <button type="button" onClick={() => removeEvent(idx)} style={{ background: '#ef4444', marginLeft: 'auto' }}>Remove</button>
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

                        {/* Excluded dates */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontWeight: 600 }}>Excluded dates</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {(ev.excludedDates || []).map((d, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <input type="date" value={d} onChange={e => {
                                            const arr = [...(ev.excludedDates || [])];
                                            arr[i] = e.target.value; update(idx, { excludedDates: arr });
                                        }} />
                                        <button type="button" onClick={() => {
                                            const arr = (ev.excludedDates || []).filter((_, j) => j !== i); update(idx, { excludedDates: arr });
                                        }} style={{ background: '#ef4444' }}>Remove</button>
                                    </div>
                                ))}
                                <button type="button" onClick={() => update(idx, { excludedDates: [ ...(ev.excludedDates || []), new Date().toISOString().slice(0,10) ] })}>+ Add date</button>
                            </div>
                        </div>
                    </div>
                )
            })}
            <div className={isValid ? 'badge-valid' : 'badge-invalid'}>
                {isValid ? 'All schedules valid' : 'Please fill schedule fields correctly'}
            </div>
        </div>
    )
}


