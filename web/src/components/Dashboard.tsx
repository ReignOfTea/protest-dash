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
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [draftLocation, setDraftLocation] = useState<LocationEntry>({ id: '', location: '', venue: '', lat: 0, lng: 0 })
  const [draftTimes, setDraftTimes] = useState<TimeEntry[]>([])
  const [draftSchedules, setDraftSchedules] = useState<RepeatingEvent[]>([])
  

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
    setEditingLocationId(null)
    setDraftLocation({ id: '', location: '', venue: '', lat: 0, lng: 0 })
    setDraftTimes([])
    setDraftSchedules([])
    setShowAddModal(true)
  }

  const openLocationForEdit = (locationId: string) => {
    const loc = locations.find(l => l.id === locationId)
    if (!loc) return
    
    setEditingLocationId(locationId)
    setDraftLocation({ ...loc })
    
    // Get existing times and schedules for this location
    const locTimes = times.filter(t => t.locationId === locationId)
    const locSchedules = repeats.filter(r => r.locationId === locationId)
    
    setDraftTimes(locTimes.map(t => ({ ...t }))) // Clone to avoid reference issues
    setDraftSchedules(locSchedules.map(s => ({ ...s }))) // Clone to avoid reference issues
    
    setShowAddModal(true)
  }

  const saveLocation = () => {
    if (!draftLocation.location.trim() || !draftLocation.venue.trim()) {
      alert('Please fill in both Location and Venue')
      return
    }
    
    const isEditing = editingLocationId !== null
    
    if (isEditing) {
      // Update existing location
      const oldId = editingLocationId!
      let newId = draftLocation.id
      
      // If location or venue changed, regenerate ID
      const oldLocation = locations.find(l => l.id === oldId)
      if (oldLocation && (oldLocation.location !== draftLocation.location || oldLocation.venue !== draftLocation.venue)) {
        newId = generateUniqueId(locations.filter(l => l.id !== oldId), draftLocation.location, draftLocation.venue, -1)
      }
      
      // Update location
      const updatedLocation = { ...draftLocation, id: newId }
      const nextLocations = locations.map(l => l.id === oldId ? updatedLocation : l)
      setLocations(sortLocations(nextLocations))
      
      // Remove old times and schedules, add new ones
      const withoutOldTimes = times.filter((t: TimeEntry) => t.locationId !== oldId)
      const withNewTimes = draftTimes.map((t: TimeEntry) => {
        const about = t.about?.trim() || undefined
        const { about: _, ...rest } = t
        return about ? { ...rest, locationId: newId, about } : { ...rest, locationId: newId }
      })
      setTimes(sortTimes([...withoutOldTimes, ...withNewTimes]))
      
      const withoutOldRepeats = repeats.filter((r: RepeatingEvent) => r.locationId !== oldId)
      const withNewRepeats = draftSchedules.map((s: RepeatingEvent) => ({ ...s, locationId: newId }))
      setRepeats([...withoutOldRepeats, ...withNewRepeats])
      
      // Update live entries if location ID changed
      if (oldId !== newId) {
        setLive(live.map((e: LiveEntry) => e.locationId === oldId ? { ...e, locationId: newId } : e))
      }
    } else {
      // Create new location
      const id = generateUniqueId(locations, draftLocation.location, draftLocation.venue, -1)
      const newLocation: LocationEntry = { ...draftLocation, id }
      
      // Add location to list and sort
      const next = sortLocations([...locations, newLocation])
      setLocations(next)
      
      // Add times with the new location ID
      if (draftTimes.length > 0) {
        const timesWithLocationId = draftTimes.map(t => {
          const about = t.about?.trim() || undefined
          const { about: _, ...rest } = t
          return about ? { ...rest, locationId: id, about } : { ...rest, locationId: id }
        })
        setTimes(sortTimes([...times, ...timesWithLocationId]))
      }
      
      // Add schedules with the new location ID
      if (draftSchedules.length > 0) {
        const schedulesWithLocationId = draftSchedules.map(s => ({ ...s, locationId: id }))
        setRepeats([...repeats, ...schedulesWithLocationId])
      }
    }
    
    setShowAddModal(false)
    setEditingLocationId(null)
    setDraftLocation({ id: '', location: '', venue: '', lat: 0, lng: 0 })
    setDraftTimes([])
    setDraftSchedules([])
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

  const futureTimes = useMemo(() => {
    const now = Date.now();
    return sortTimes(times.filter(t => {
      if (!t.datetime) return false;
      const parsed = Date.parse(t.datetime);
      if (isNaN(parsed)) return false;
      return parsed >= now;
    }));
  }, [times])

  return (
    <div className="main" style={{ paddingTop: 0 }}>
      <div className="responsive-header" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Location Control</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Filter locations…" value={locQuery} onChange={e => setLocQuery(e.target.value)} />
          <button onClick={addLocation}>+ Add location</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {indices.map(sortedIndex => {
          const sorted = sortLocations(locations)
          const loc = sorted[sortedIndex]
          // Find original index - prefer by ID, otherwise by object reference
          let originalIndex = -1
          if (loc.id) {
            originalIndex = locations.findIndex(l => l.id === loc.id)
          } else {
            // For locations without ID, find by reference
            originalIndex = locations.findIndex(l => l === loc)
            // Fallback to field matching if reference doesn't work
            if (originalIndex === -1) {
              originalIndex = locations.findIndex(l => 
                !l.id && 
                l.location === loc.location && 
                l.venue === loc.venue &&
                l.lat === loc.lat &&
                l.lng === loc.lng
              )
            }
          }
          // Use ID if available, otherwise create a stable temp key based on original index
          const stableKey = loc.id || `temp-${originalIndex >= 0 ? originalIndex : sortedIndex}`
          const locTimes = futureTimes.filter(t => t.locationId === loc.id)
          const locRepeats = repeats.filter(r => r.locationId === loc.id)
          const locLive = live.filter(e => e.locationId === loc.id)
          return (
            <div 
              key={stableKey} 
              className="section-card"
            >
              <div className="responsive-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ flex: '1 1 auto', minWidth: 200, wordBreak: 'break-word' }}>{loc.location} — {loc.venue}</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {loc.id && (
                    <button onClick={() => openLocationForEdit(loc.id)}>Open</button>
                  )}
                  <button style={{ background: '#ef4444', padding: '6px 12px', fontSize: '14px' }} onClick={() => removeLocation(sortedIndex)}>Remove</button>
                </div>
              </div>

              {/* Summary info */}
              {loc.id && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--panel-2)', borderRadius: '8px', fontSize: '14px', color: 'var(--muted)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                    <div><strong>Times:</strong> {locTimes.length}</div>
                    <div><strong>Schedules:</strong> {locRepeats.length}</div>
                    <div><strong>Live entries:</strong> {locLive.length}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Location Modal */}
      {showAddModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false)
            }
          }}
        >
          <div 
            className="section-card"
            style={{
              background: 'var(--panel)',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
              {editingLocationId ? 'Edit Location' : 'Add New Location'}
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Location *</label>
                <input 
                  value={draftLocation.location} 
                  onChange={e => {
                    const location = e.target.value
                    setDraftLocation(prev => {
                      const updated = { ...prev, location }
                      // Auto-generate ID as user types (only for new locations)
                      if (!editingLocationId && location && prev.venue) {
                        updated.id = generateUniqueId(locations, location, prev.venue, -1)
                      } else if (!editingLocationId) {
                        updated.id = ''
                      }
                      return updated
                    })
                  }}
                  placeholder="e.g., Hull"
                  autoFocus
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Venue *</label>
                <input 
                  value={draftLocation.venue} 
                  onChange={e => {
                    const venue = e.target.value
                    setDraftLocation(prev => {
                      const updated = { ...prev, venue }
                      // Auto-generate ID as user types (only for new locations)
                      if (!editingLocationId && venue && prev.location) {
                        updated.id = generateUniqueId(locations, prev.location, venue, -1)
                      } else if (!editingLocationId) {
                        updated.id = ''
                      }
                      return updated
                    })
                  }}
                  placeholder="e.g., Royal Hotel"
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Latitude</label>
                  <input 
                    type="number" 
                    step="any" 
                    value={draftLocation.lat} 
                    onChange={e => setDraftLocation(prev => ({ ...prev, lat: Number(e.target.value) }))}
                    onPaste={(e) => {
                      e.preventDefault()
                      const pastedText = e.clipboardData.getData('text')
                      // Try to parse comma-separated lat,lng
                      const parts = pastedText.trim().split(',').map(s => s.trim())
                      if (parts.length >= 2) {
                        const lat = Number(parts[0])
                        const lng = Number(parts[1])
                        if (!isNaN(lat) && !isNaN(lng)) {
                          setDraftLocation(prev => ({ ...prev, lat, lng }))
                          return
                        }
                      }
                      // If not comma-separated, just set lat
                      const lat = Number(pastedText)
                      if (!isNaN(lat)) {
                        setDraftLocation(prev => ({ ...prev, lat }))
                      }
                    }}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Longitude</label>
                  <input 
                    type="number" 
                    step="any" 
                    value={draftLocation.lng} 
                    onChange={e => setDraftLocation(prev => ({ ...prev, lng: Number(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
              </div>
              
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>ID (auto-generated)</label>
                <input 
                  value={draftLocation.id || '(will be generated)'} 
                  readOnly 
                  style={{ color: 'var(--muted)' }}
                />
              </div>

              {/* Upcoming Times */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontWeight: 600 }}>Upcoming Times</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      now.setMinutes(now.getMinutes() + 15 - (now.getMinutes() % 15), 0, 0)
                      const year = now.getFullYear()
                      const month = String(now.getMonth() + 1).padStart(2, '0')
                      const day = String(now.getDate()).padStart(2, '0')
                      const hours = String(now.getHours()).padStart(2, '0')
                      const minutes = String(now.getMinutes()).padStart(2, '0')
                      const datetimeStr = `${year}-${month}-${day}T${hours}:${minutes}:00`
                      setDraftTimes([...draftTimes, { locationId: '', datetime: datetimeStr }])
                    }}
                    style={{ padding: '6px 12px', fontSize: '14px' }}
                  >
                    + Add time
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {draftTimes.map((t, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="datetime-local" 
                        value={t.datetime ? t.datetime.slice(0, 16) : ''}
                        onChange={e => {
                          const datetimeValue = e.target.value ? e.target.value + ':00' : ''
                          setDraftTimes(prev => prev.map((time, i) => i === idx ? { ...time, datetime: datetimeValue } : time))
                        }}
                        style={{ flex: 1 }}
                      />
                      <textarea
                        value={t.about || ''}
                        onChange={e => {
                          const aboutValue = e.target.value
                          setDraftTimes(prev => prev.map((time, i) => {
                            if (i === idx) {
                              return { ...time, about: aboutValue }
                            }
                            return time
                          }))
                        }}
                        placeholder="About (optional)"
                        rows={1}
                        style={{ flex: 1, fontSize: '14px', minHeight: '40px' }}
                      />
                      <button 
                        type="button"
                        onClick={() => setDraftTimes(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: '#ef4444', padding: '6px 12px', fontSize: '14px' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedules */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontWeight: 600 }}>Schedules</label>
                  <button 
                    type="button"
                    onClick={() => {
                      setDraftSchedules([...draftSchedules, { 
                        name: '', 
                        locationId: '', 
                        weekday: 0, 
                        time: '18:00:00', 
                        enabled: true, 
                        created: new Date().toISOString(), 
                        excludedDates: [] 
                      }])
                    }}
                    style={{ padding: '6px 12px', fontSize: '14px' }}
                  >
                    + Add schedule
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {draftSchedules.map((s, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                      <input 
                        placeholder="Schedule name"
                        value={s.name}
                        onChange={e => setDraftSchedules(prev => prev.map((schedule, i) => i === idx ? { ...schedule, name: e.target.value } : schedule))}
                      />
                      <select 
                        value={s.weekday}
                        onChange={e => setDraftSchedules(prev => prev.map((schedule, i) => i === idx ? { ...schedule, weekday: Number(e.target.value) } : schedule))}
                      >
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w, i) => (
                          <option key={i} value={i}>{w}</option>
                        ))}
                      </select>
                      <input 
                        type="time" 
                        step="1"
                        value={s.time}
                        onChange={e => setDraftSchedules(prev => prev.map((schedule, i) => i === idx ? { ...schedule, time: e.target.value } : schedule))}
                      />
                      <button 
                        type="button"
                        onClick={() => setDraftSchedules(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: '#ef4444', padding: '6px 12px', fontSize: '14px' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button 
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingLocationId(null)
                    setDraftLocation({ id: '', location: '', venue: '', lat: 0, lng: 0 })
                    setDraftTimes([])
                    setDraftSchedules([])
                  }}
                  style={{ background: '#374151' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={saveLocation}
                  style={{ background: '#10b981' }}
                >
                  Save Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


