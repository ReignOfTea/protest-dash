import { useMemo, useState } from 'react'
import type { LocationEntry } from './LocationsEditor'
import type { TimeEntry } from './TimesEditor'
import type { RepeatingEvent } from './RepeatingEventsEditor'
import type { LiveEntry } from './LiveEditor'

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function generateUniqueId(existing: LocationEntry[], location: string, venue: string, selfIndex: number): string {
  const base = `${slugify(location)}-${slugify(venue)}`
  if (!base) return ''
  let candidate = base
  let i = 2
  const taken = new Set(existing.map((e, idx) => (idx === selfIndex ? '' : e.id)))
  while (taken.has(candidate)) { candidate = `${base}-${i++}` }
  return candidate
}

function sortLocations(list: LocationEntry[]): LocationEntry[] {
  return [...list].sort((a, b) => {
    const la = (a.location || '').localeCompare(b.location || '')
    return la !== 0 ? la : (a.venue || '').localeCompare(b.venue || '')
  })
}

function sortTimes(list: TimeEntry[]): TimeEntry[] {
  return [...list].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
}

type Props = {
  locations: LocationEntry[]
  setLocations: (next: LocationEntry[]) => void
  times: TimeEntry[]
  setTimes: (next: TimeEntry[]) => void
  repeats: RepeatingEvent[]
  setRepeats: (next: RepeatingEvent[]) => void
  live: LiveEntry[]
  setLive: (next: LiveEntry[]) => void
}

export default function Dashboard({ locations, setLocations, times, setTimes, repeats, setRepeats, live, setLive }: Props) {
  const [locQuery, setLocQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const indices = useMemo(() => {
    const sorted = sortLocations(locations)
    const q = locQuery.toLowerCase()
    return sorted
      .map((_, i) => i)
      .filter(i => {
        const e = sorted[i]
        return !q || `${e.location} ${e.venue} ${e.id}`.toLowerCase().includes(q)
      })
  }, [locations, locQuery])

  const addLocation = () => {
    const draft: LocationEntry = { id: '', location: '', venue: '', lat: 0, lng: 0 }
    setLocations([ ...locations, draft ])
  }

  const updateLocation = (indexInSorted: number, patch: Partial<LocationEntry>) => {
    // indexInSorted references the sorted list; map back to original by id
    const sorted = sortLocations(locations)
    const target = sorted[indexInSorted]
    const originalIndex = locations.findIndex(l => l.id === target.id)
    const next = locations.slice()
    const updated: LocationEntry = { ...next[originalIndex], ...patch }
    if ('location' in patch || 'venue' in patch) {
      updated.id = generateUniqueId(next, updated.location, updated.venue, originalIndex)
    }
    next[originalIndex] = updated
    setLocations(sortLocations(next))
  }

  const removeLocation = (indexInSorted: number) => {
    const sorted = sortLocations(locations)
    const target = sorted[indexInSorted]
    const nextLocs = locations.filter(l => l !== target)
    setLocations(sortLocations(nextLocs))
    // Also remove times/live/repeats referencing this location
    setTimes(times.filter(t => t.locationId !== target.id))
    setLive(live.filter(e => e.locationId !== target.id))
    setRepeats(repeats.filter(r => r.locationId !== target.id))
  }

  const futureTimes = useMemo(() => sortTimes(times.filter(t => Date.parse(t.datetime) >= Date.now())), [times])

  return (
    <div className="main" style={{ paddingTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Location Control</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Filter locations…" value={locQuery} onChange={e => setLocQuery(e.target.value)} />
          <button onClick={addLocation}>+ Add location</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {indices.map(sortedIndex => {
          const loc = sortLocations(locations)[sortedIndex]
          const isOpen = openId === loc.id
          const locTimes = futureTimes.filter(t => t.locationId === loc.id)
          const locRepeats = repeats.filter(r => r.locationId === loc.id)
          const locLive = live.filter(e => e.locationId === loc.id)
          return (
            <div key={loc.id} className="section-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong>{loc.location} — {loc.venue}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setOpenId(isOpen ? null : loc.id)}>{isOpen ? 'Close' : 'Open'}</button>
                  <button style={{ background: '#ef4444' }} onClick={() => removeLocation(sortedIndex)}>Remove</button>
                </div>
              </div>

              {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 16, marginTop: 12 }}>
                  {/* Details */}
                  <div className="section-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontWeight: 600 }}>Location</label>
                      <input value={loc.location} onChange={e => updateLocation(sortedIndex, { location: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontWeight: 600 }}>Venue</label>
                      <input value={loc.venue} onChange={e => updateLocation(sortedIndex, { venue: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 600 }}>Lat</label>
                      <input type="number" step="any" value={loc.lat} onChange={e => updateLocation(sortedIndex, { lat: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 600 }}>Lng</label>
                      <input type="number" step="any" value={loc.lng} onChange={e => updateLocation(sortedIndex, { lng: Number(e.target.value) })} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontWeight: 600 }}>ID</label>
                      <input value={loc.id} readOnly />
                    </div>
                  </div>

                  {/* Times */}
                  <div className="section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Upcoming Times</strong>
                      <button onClick={() => setTimes(sortTimes([ ...times, { locationId: loc.id, datetime: new Date().toISOString().slice(0,16)+':00' } ]))}>+ Add time</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {locTimes.map((t) => (
                        <div key={`${t.locationId}|${t.datetime}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <input type="datetime-local" value={t.datetime.slice(0,16)} onChange={e => {
                            const next = times.map(x => x === t ? { ...t, datetime: e.target.value } : x)
                            setTimes(sortTimes(next))
                          }} />
                          <button style={{ background: '#ef4444' }} onClick={() => setTimes(times.filter(x => x !== t))}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Repeating */}
                  <div className="section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Schedules</strong>
                      <button onClick={() => setRepeats([ ...repeats, { name: '', locationId: loc.id, weekday: 0, time: '18:00:00', enabled: true, created: new Date().toISOString(), excludedDates: [] } ])}>+ Add schedule</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {locRepeats.map((r, i) => (
                        <div key={`${r.locationId}|${r.weekday}|${r.time}|${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                          <input placeholder="Name" value={r.name} onChange={e => setRepeats(repeats.map(x => x === r ? { ...r, name: e.target.value } : x))} />
                          <select value={r.weekday} onChange={e => setRepeats(repeats.map(x => x === r ? { ...r, weekday: Number(e.target.value) } : x))}>
                            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w, idx) => (<option key={idx} value={idx}>{w}</option>))}
                          </select>
                          <input type="time" step="1" value={r.time} onChange={e => setRepeats(repeats.map(x => x === r ? { ...r, time: e.target.value } : x))} />
                          <button style={{ background: '#ef4444' }} onClick={() => setRepeats(repeats.filter(x => x !== r))}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live */}
                  <div className="section-card" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Live entries</strong>
                      <button onClick={() => setLive([ ...live, { locationId: loc.id, datetime: locTimes[0]?.datetime || new Date().toISOString(), live: [] } ])}>+ Add live</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {locLive.map((entry, entryIdx) => (
                        <div key={`${entry.locationId}|${entry.datetime}|${entryIdx}`} className="section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr auto', gap: 8, alignItems: 'center' }}>
                            <select value={entry.datetime} onChange={ev => setLive(live.map(x => x === entry ? { ...entry, datetime: ev.target.value } : x))}>
                              {locTimes.map(t => (<option key={t.datetime} value={t.datetime}>{new Date(t.datetime).toLocaleString()}</option>))}
                            </select>
                            <button style={{ background: '#ef4444' }} onClick={() => setLive(live.filter(x => x !== entry))}>Remove entry</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(entry.live || []).map((li, i) => (
                              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: 8, alignItems: 'center' }}>
                                <input value={li.link} onChange={ev => { const arr = [...(entry.live||[])]; arr[i] = { ...li, link: ev.target.value }; setLive(live.map(x => x === entry ? { ...entry, live: arr } : x)) }} placeholder="Link" />
                                <select value={li.logo || ''} onChange={ev => { const arr = [...(entry.live||[])]; arr[i] = { ...li, logo: ev.target.value || '' }; setLive(live.map(x => x === entry ? { ...entry, live: arr } : x)) }}>
                                  <option value="">None</option>
                                  <option value="x">X</option>
                                  <option value="youtube">YouTube</option>
                                  <option value="facebook">Facebook</option>
                                </select>
                                <input value={li.name} onChange={ev => { const arr = [...(entry.live||[])]; arr[i] = { ...li, name: ev.target.value }; setLive(live.map(x => x === entry ? { ...entry, live: arr } : x)) }} placeholder="Name" />
                                <input value={li.comment || ''} onChange={ev => { const arr = [...(entry.live||[])]; arr[i] = { ...li, comment: ev.target.value }; setLive(live.map(x => x === entry ? { ...entry, live: arr } : x)) }} placeholder="Comment (optional)" />
                                <button style={{ background: '#ef4444' }} onClick={() => { const arr = (entry.live||[]).filter((_, j) => j !== i); setLive(live.map(x => x === entry ? { ...entry, live: arr } : x)) }}>Remove</button>
                              </div>
                            ))}
                            <div>
                              <button onClick={() => setLive(live.map(x => x === entry ? { ...entry, live: [ ...(entry.live||[]), { link: '', name: '', comment: '', logo: '' } ] } : x))}>+ Add source</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


