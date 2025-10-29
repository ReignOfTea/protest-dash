import { useMemo, useState } from 'react'
import type { TimeEntry } from './TimesEditor'
import type { LocationEntry } from './LocationsEditor'

export type LiveItem = {
    link: string
    name: string
    comment?: string
    logo: string // 'x' | 'youtube' | 'facebook' | ''
}

export type LiveEntry = {
    locationId: string
    datetime: string
    live: LiveItem[]
}

type Props = {
    value: LiveEntry[]
    onChange: (next: LiveEntry[]) => void
    times: TimeEntry[]
    locations: LocationEntry[]
}

function labelForTime(t: TimeEntry, locs: LocationEntry[]): string {
    const loc = locs.find(l => l.id === t.locationId)
    const date = new Date(t.datetime)
    const ds = isNaN(date.getTime()) ? t.datetime : date.toLocaleString()
    return `${loc ? `${loc.location} — ${loc.venue}` : t.locationId} • ${ds}`
}

const logoOptions = [
    { value: '', label: 'None' },
    { value: 'x', label: 'X' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'facebook', label: 'Facebook' },
]

export default function LiveEditor({ value, onChange, times, locations }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const [query, setQuery] = useState('')
    const [headerFilter, setHeaderFilter] = useState('')

    const timesSorted = useMemo(() => {
        return [...(times || [])].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    }, [times])

    const filteredTimes = useMemo(() => {
        const q = query.toLowerCase()
        if (!q) return timesSorted
        return timesSorted.filter(t => labelForTime(t, locations).toLowerCase().includes(q))
    }, [query, timesSorted, locations])

    const addEntry = () => onChange([...(value || []), { locationId: '', datetime: '', live: [] }])
    const removeEntry = (index: number) => onChange(value.filter((_, i) => i !== index))
    const update = (index: number, patch: Partial<LiveEntry>) => { const next = value.slice(); next[index] = { ...next[index], ...patch }; onChange(next) }

    const rowIndices = useMemo(() => {
        const q = headerFilter.toLowerCase()
        const label = (e: LiveEntry) => labelForTime({ locationId: e.locationId, datetime: e.datetime }, locations).toLowerCase()
        return value
            .map((_, i) => i)
            .filter(i => !q || label(value[i]).includes(q) || (value[i].live||[]).some(li => (`${li.name} ${li.comment||''} ${li.link}`).toLowerCase().includes(q)))
            .sort((a, b) => new Date(value[a].datetime).getTime() - new Date(value[b].datetime).getTime())
    }, [value, headerFilter, locations])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0 }}>Live</h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Filter by event or source…" value={headerFilter} onChange={e => setHeaderFilter(e.target.value)} />
                    <button type="button" onClick={addEntry}>+ Add live entry</button>
                </div>
            </div>

            {rowIndices.map((idx) => {
                const e = value[idx]
                const selectedLabel = e.locationId && e.datetime ? labelForTime({ locationId: e.locationId, datetime: e.datetime }, locations) : ''
                return (
                    <div key={idx} className="section-card" style={{ display: 'grid', gridTemplateColumns: '3fr auto', gap: 12 }}>
                        <div>
                            <label style={{ fontWeight: 600 }}>Event</label>
                            <input
                                placeholder="Filter by location or date…"
                                value={openIndex === idx ? query : selectedLabel}
                                onChange={ev => { setQuery(ev.target.value); setOpenIndex(idx) }}
                                onFocus={() => { setQuery(''); setOpenIndex(idx) }}
                                onBlur={() => setTimeout(() => setOpenIndex(current => current === idx ? null : current), 150)}
                                style={{ width: '60ch', maxWidth: '100%' }}
                            />
                            {openIndex === idx && (
                                <div style={{ border: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                                    {filteredTimes.map(t => {
                                        const label = labelForTime(t, locations)
                                        return (
                                            <div key={`${t.locationId}|${t.datetime}`} style={{ padding: 8, cursor: 'pointer' }} onClick={() => { update(idx, { locationId: t.locationId, datetime: t.datetime }); setOpenIndex(null) }}>
                                                {label}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'end' }}>
                            <button type="button" onClick={() => removeEntry(idx)} style={{ background: '#ef4444' }}>Remove</button>
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <label style={{ fontWeight: 600 }}>Live sources</label>
                            {(e.live || []).map((li, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: 8 }}>
                                    <input value={li.link} onChange={ev => { const arr = [...e.live]; arr[i] = { ...li, link: ev.target.value }; update(idx, { live: arr }) }} placeholder="Link" />
                                    <select value={li.logo || ''} onChange={ev => { const arr = [...e.live]; arr[i] = { ...li, logo: ev.target.value || '' }; update(idx, { live: arr }) }}>
                                        {logoOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                                    </select>
                                    <input value={li.name} onChange={ev => { const arr = [...e.live]; arr[i] = { ...li, name: ev.target.value }; update(idx, { live: arr }) }} placeholder="Name" />
                                    <input value={li.comment || ''} onChange={ev => { const arr = [...e.live]; arr[i] = { ...li, comment: ev.target.value }; update(idx, { live: arr }) }} placeholder="Comment (optional)" />
                                    <button type="button" onClick={() => { const arr = e.live.filter((_, j) => j !== i); update(idx, { live: arr }) }} style={{ background: '#ef4444' }}>Remove</button>
                                </div>
                            ))}
                            <div>
                                <button type="button" onClick={() => update(idx, { live: [ ...(e.live || []), { link: '', name: '', comment: '', logo: '' } ] })}>+ Add source</button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}


