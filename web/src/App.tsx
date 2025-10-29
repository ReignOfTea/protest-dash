import './App.css'
import { useEffect, useState } from 'react'
import axios from 'axios'
import InfoEditor from './components/InfoEditor'
import type { InfoData, Section } from './components/InfoEditor'
import LocationsEditor from './components/LocationsEditor'
import type { LocationEntry } from './components/LocationsEditor'
import TimesEditor from './components/TimesEditor'
import type { TimeEntry } from './components/TimesEditor'
import RepeatingEventsEditor from './components/RepeatingEventsEditor'
import type { RepeatingEvent } from './components/RepeatingEventsEditor'
import LiveEditor from './components/LiveEditor'
import type { LiveEntry } from './components/LiveEditor'
import Dashboard from './components/Dashboard'
import ContentDashboard from './components/ContentDashboard'
import ActionsStatus from './components/ActionsStatus'
import Login, { type User } from './components/Login'

// Configure axios to send credentials
axios.defaults.withCredentials = true

type FileState = {
  content: InfoData | LocationEntry[] | TimeEntry[] | RepeatingEvent[] | LiveEntry[]
  sha?: string
  dirty: boolean
}

const EDITABLE_FILES = ['about.json', 'attend.json', 'more.json', 'locations.json', 'times.json', 'repeating-events.json', 'live.json']

function App() {
  const [files] = useState<string[]>(EDITABLE_FILES)
  const [selected, setSelected] = useState<string>('about.json')
  const [view, setView] = useState<'files' | 'locations' | 'content'>('locations')
  const [stateByFile, setStateByFile] = useState<Record<string, FileState>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Check authentication status
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await axios.get('/api/auth/me')
        if (cancelled) return
        setUser(resp.data?.user || null)
      } catch {
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout')
      setUser(null)
      window.location.reload()
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  // Load selected file if not present
  useEffect(() => {
    if (authLoading || !user) return // Don't try to load files if not authenticated
    let cancelled = false
    if (stateByFile[selected]) return
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const resp = await axios.get(`/api/file/${encodeURIComponent(selected)}`)
        if (cancelled) return
        let content = resp.data.content
        if (selected === 'times.json' && Array.isArray(content)) {
          const now = Date.now()
          content = content.filter((t: { datetime?: string }) => {
            const ts = Date.parse(String(t?.datetime || ''))
            return !Number.isNaN(ts) && ts >= now
          })
        }
        setStateByFile(prev => ({
          ...prev,
          [selected]: { content, sha: resp.data.sha ?? undefined, dirty: false },
        }))
      } catch (e: unknown) {
        const error = e as { response?: { data?: { error?: string } }; message?: string }
        setError(error?.response?.data?.error || error?.message || 'Failed to load file')
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected, stateByFile, authLoading, user])

  const current = stateByFile[selected]

  const onChange = (next: InfoData | LocationEntry[] | TimeEntry[] | RepeatingEvent[] | LiveEntry[]) => {
    setStateByFile(prev => ({
      ...prev,
      [selected]: { ...(prev[selected] || { dirty: false }), content: next, dirty: true },
    }))
  }
  const onAddSection = () => {
    const content = current?.content
    if (!content || !('title' in content) || !('sections' in content)) return
    const value = content as InfoData
    onChange({ ...value, sections: [...value.sections, { heading: '', content: '' }] })
  }
  const onRemoveSection = (index: number) => {
    const content = current?.content
    if (!content || !('title' in content) || !('sections' in content)) return
    const value = content as InfoData
    onChange({ ...value, sections: value.sections.filter((_: Section, i: number) => i !== index) })
  }
  const onUpdateSection = (index: number, key: keyof Section, valueStr: string) => {
    const content = current?.content
    if (!content || !('title' in content) || !('sections' in content)) return
    const value = content as InfoData
    onChange({
      ...value,
      sections: value.sections.map((s: Section, i: number) => (i === index ? { ...s, [key]: valueStr } : s)),
    })
  }

  const pushChanges = async () => {
    try {
      setPushing(true)
      setError(null)
      const dirtyEntries = Object.entries(stateByFile).filter(([, v]) => v.dirty)
      if (dirtyEntries.length === 0) {
        alert('No changes to push')
        return
      }
      const filesPayload = dirtyEntries.map(([name, v]) => ({
        path: `data/${name}`,
        content: v.content,
      }))
      const resp = await axios.post('/api/batch', {
        files: filesPayload,
        commitMessage: 'Update files via dashboard',
      })
      if (resp.data?.commitSha) {
        // mark all as clean
        setStateByFile(prev => {
          const next = { ...prev }
          for (const [name, v] of Object.entries(next)) {
            if (v.dirty) next[name] = { ...v, dirty: false }
          }
          return next
        })
        alert('Changes pushed successfully.')
      }
    } catch (e: unknown) {
      const error = e as { response?: { data?: { details?: string | { message?: string } } }; message?: string }
      const details = error?.response?.data?.details
      const message = typeof details === 'string' ? details : details?.message || error?.message || 'Failed to push changes'
      setError(message || 'Failed to push changes')
    } finally {
      setPushing(false)
    }
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

  // Ensure locations are loaded when editing times
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    if (selected !== 'times.json' && selected !== 'repeating-events.json' && selected !== 'live.json') return
    if (stateByFile['locations.json']) return
    ;(async () => {
      try {
        const resp = await axios.get('/api/file/locations.json')
        if (cancelled) return
        setStateByFile(prev => ({ ...prev, ['locations.json']: { content: resp.data.content || [], sha: resp.data.sha ?? undefined, dirty: false } }))
      } catch {
        // Silently fail - file may not exist or is not critical for this operation
      }
    })()
    return () => { cancelled = true }
  }, [selected, stateByFile, authLoading, user])

  // Ensure times are loaded when editing live
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    if (selected !== 'live.json') return
    if (stateByFile['times.json']) return
    ;(async () => {
      try {
        const resp = await axios.get('/api/file/times.json')
        if (cancelled) return
        setStateByFile(prev => ({ ...prev, ['times.json']: { content: resp.data.content || [], sha: resp.data.sha ?? undefined, dirty: false } }))
      } catch {
        // Silently fail - file may not exist or is not critical for this operation
      }
    })()
    return () => { cancelled = true }
  }, [selected, stateByFile, authLoading, user])

  function getFourWeekWindowInstances(ev: RepeatingEvent): TimeEntry[] {
    if (!ev.enabled) return []
    const now = new Date()
    const end = new Date(now.getTime() + 28 * 24 * 3600 * 1000)
    const excluded = new Set((ev.excludedDates || []))
    const out: TimeEntry[] = []
    for (let d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d <= end; d = new Date(d.getTime() + 86400000)) {
      if (d.getDay() !== ev.weekday) continue
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${da}`
      if (excluded.has(dateStr)) continue
      out.push({ locationId: ev.locationId, datetime: `${dateStr}T${ev.time}` })
    }
    return out
  }

  function uniqueTimes(times: TimeEntry[]): TimeEntry[] {
    const seen = new Set<string>()
    const out: TimeEntry[] = []
    for (const t of times) {
      const key = `${t.locationId}|${t.datetime}`
      if (seen.has(key)) continue
      seen.add(key); out.push(t)
    }
    return out
  }

  // Preload data needed for Dashboard views
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    if (view !== 'locations' && view !== 'content') return
    const needs: Array<[string, string]> = []
    if (!stateByFile['locations.json']) needs.push(['locations.json', '/api/file/locations.json'])
    if (!stateByFile['times.json']) needs.push(['times.json', '/api/file/times.json'])
    if (!stateByFile['repeating-events.json']) needs.push(['repeating-events.json', '/api/file/repeating-events.json'])
    if (!stateByFile['live.json']) needs.push(['live.json', '/api/file/live.json'])
    if (view === 'content') {
      if (!stateByFile['about.json']) needs.push(['about.json', '/api/file/about.json'])
      if (!stateByFile['attend.json']) needs.push(['attend.json', '/api/file/attend.json'])
      if (!stateByFile['more.json']) needs.push(['more.json', '/api/file/more.json'])
    }
    if (needs.length === 0) return
    ;(async () => {
      try {
        const results = await Promise.all(needs.map(([name, url]) => axios.get(url).then(r => ({ name, data: r.data }))))
        if (cancelled) return
        setStateByFile(prev => {
          const next = { ...prev }
          for (const { name, data } of results) {
            let content = data.content
            if (name === 'times.json' && Array.isArray(content)) {
              const now = Date.now()
              content = content.filter((t: { datetime?: string }) => {
                const ts = Date.parse(String(t?.datetime || ''))
                return !Number.isNaN(ts) && ts >= now
              })
            }
            next[name] = { content, sha: data.sha ?? undefined, dirty: false }
          }
          return next
        })
      } catch {
        // Silently fail - files may not exist or are not critical for this operation
      }
    })()
    return () => { cancelled = true }
  }, [view, stateByFile, authLoading, user])

  if (authLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Loading...</div>
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setView('locations')} className={`file-button ${view==='locations' ? 'active' : ''}`}>Location Control</button>
              <button onClick={() => setView('content')} className={`file-button ${view==='content' ? 'active' : ''}`}>Content Control</button>
              <button onClick={() => setView('files')} className={`file-button ${view==='files' ? 'active' : ''}`}>Files</button>
            </div>
            <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Logged in as</div>
              <div style={{ fontWeight: 600 }}>{user.username}</div>
              <button onClick={handleLogout} style={{ marginTop: 8, background: '#ef4444', width: '100%', fontSize: 12 }}>Logout</button>
            </div>
          </div>
          {view === 'files' && (
            <>
              <h2 style={{ marginTop: 0 }}>Files</h2>
              <div className="file-list">
                {files.map(name => {
                  const dirty = stateByFile[name]?.dirty
                  const isSelected = selected === name
                  return (
                    <button
                      key={name}
                      onClick={() => setSelected(name)}
                      className={`file-button ${isSelected ? 'active' : ''}`}
                    >
                      {name} {dirty ? '•' : ''}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={pushChanges}
            disabled={pushing}
            style={{ background: '#10b981', width: '100%' }}
          >
            {pushing ? 'Pushing…' : 'Push changes'}
          </button>
        </div>
        <div style={{ flexShrink: 0, paddingTop: 12 }}>
          <ActionsStatus />
        </div>
      </aside>
      <main className="main">
        {view === 'locations' ? (
          <Dashboard
            locations={((stateByFile['locations.json']?.content as unknown) as LocationEntry[]) || []}
            setLocations={(next) => setStateByFile(prev => ({ ...prev, ['locations.json']: { ...(prev['locations.json'] || { dirty: false }), content: next, dirty: true } }))}
            times={((stateByFile['times.json']?.content as unknown) as TimeEntry[]) || []}
            setTimes={(next) => setStateByFile(prev => ({ ...prev, ['times.json']: { ...(prev['times.json'] || { dirty: false }), content: next, dirty: true } }))}
            repeats={((stateByFile['repeating-events.json']?.content as unknown) as RepeatingEvent[]) || []}
            setRepeats={(next) => setStateByFile(prev => ({ ...prev, ['repeating-events.json']: { ...(prev['repeating-events.json'] || { dirty: false }), content: next, dirty: true } }))}
            live={((stateByFile['live.json']?.content as unknown) as LiveEntry[]) || []}
            setLive={(next) => setStateByFile(prev => ({ ...prev, ['live.json']: { ...(prev['live.json'] || { dirty: false }), content: next, dirty: true } }))}
          />
        ) : view === 'content' ? (
          <ContentDashboard
            about={(stateByFile['about.json']?.content as InfoData) || { title: '', sections: [] }}
            setAbout={(next) => setStateByFile(prev => ({ ...prev, ['about.json']: { ...(prev['about.json'] || { dirty: false }), content: next, dirty: true } }))}
            attend={(stateByFile['attend.json']?.content as InfoData) || { title: '', sections: [] }}
            setAttend={(next) => setStateByFile(prev => ({ ...prev, ['attend.json']: { ...(prev['attend.json'] || { dirty: false }), content: next, dirty: true } }))}
            more={(stateByFile['more.json']?.content as InfoData) || { title: '', sections: [] }}
            setMore={(next) => setStateByFile(prev => ({ ...prev, ['more.json']: { ...(prev['more.json'] || { dirty: false }), content: next, dirty: true } }))}
          />
        ) : (
        <>
        <h1 style={{ marginTop: 0 }}>{selected}</h1>
        {error && (
          <div style={{ color: 'white', background: '#b00020', padding: '8px 12px', borderRadius: 10, marginBottom: 16 }}>
            {String(error)}
          </div>
        )}
        {loading && <div>Loading…</div>}
        {!loading && current && (
          selected === 'locations.json' ? (
            <LocationsEditor
              value={(current.content as unknown as LocationEntry[]) || []}
              onChange={(next) => setStateByFile(prev => {
                const prevLocs = ((prev['locations.json']?.content as unknown) as LocationEntry[]) || []
                const prevIds = new Set(prevLocs.map(l => l.id))
                const sortedNext = sortLocations(next)
                const nextIds = new Set(sortedNext.map(l => l.id))
                const removedIds: Set<string> = new Set([...prevIds].filter(id => !nextIds.has(id)))

                const nextState: typeof prev = {
                  ...prev,
                  ['locations.json']: { ...(prev['locations.json'] || { dirty: false }), content: sortedNext, dirty: true },
                }
                if (removedIds.size > 0 && prev['times.json']) {
                  const times = ((prev['times.json']!.content as unknown) as TimeEntry[]) || []
                  const filteredTimes = times.filter(t => !removedIds.has(t.locationId))
                  if (filteredTimes.length !== times.length && prev['times.json']) {
                    nextState['times.json'] = { ...prev['times.json'], content: filteredTimes, dirty: true }
                  }
                }
                return nextState
              })}
            />
          ) : selected === 'times.json' ? (
            <TimesEditor
              value={(current.content as unknown as TimeEntry[]) || []}
              locations={((stateByFile['locations.json']?.content as unknown) as LocationEntry[]) || []}
              onCreateLocation={(newLoc) => setStateByFile(prev => {
                const locs = ((prev['locations.json']?.content as unknown) as LocationEntry[]) || []
                const nextLocs = sortLocations([...locs, newLoc])
                return {
                  ...prev,
                  ['locations.json']: { ...(prev['locations.json'] || { dirty: false }), content: nextLocs, dirty: true },
                }
              })}
              onChange={(next) => setStateByFile(prev => ({
                ...prev,
                [selected]: { ...(prev[selected] || { dirty: false }), content: sortTimes(next), dirty: true },
              }))}
            />
          ) : selected === 'repeating-events.json' ? (
            <RepeatingEventsEditor
              value={(current.content as unknown as RepeatingEvent[]) || []}
              locations={((stateByFile['locations.json']?.content as unknown) as LocationEntry[]) || []}
              onCreateLocation={(newLoc) => setStateByFile(prev => {
                const locs = ((prev['locations.json']?.content as unknown) as LocationEntry[]) || []
                const nextLocs = [...locs, newLoc]
                return {
                  ...prev,
                  ['locations.json']: { ...(prev['locations.json'] || { dirty: false }), content: nextLocs, dirty: true },
                }
              })}
              onChange={(next) => setStateByFile(prev => {
                const prevRepeats = ((prev['repeating-events.json']?.content as unknown) as RepeatingEvent[]) || []
                const prevKeys = new Set(prevRepeats.map(e => `${e.locationId}|${e.weekday}|${e.time}`))
                const nextKeys = new Set(next.map(e => `${e.locationId}|${e.weekday}|${e.time}`))

                // Removed schedules
                const removed = prevRepeats.filter(e => !nextKeys.has(`${e.locationId}|${e.weekday}|${e.time}`))
                // Added or updated schedules
                const added = next.filter(e => !prevKeys.has(`${e.locationId}|${e.weekday}|${e.time}`))

                const nextState: typeof prev = {
                  ...prev,
                  ['repeating-events.json']: { ...(prev['repeating-events.json'] || { dirty: false }), content: next, dirty: true },
                }

                // Start with existing times
                let times = ((prev['times.json']?.content as unknown) as TimeEntry[]) || []

                // Remove instances from removed schedules
                if (removed.length > 0) {
                  const toRemove = new Set(removed.flatMap(r => getFourWeekWindowInstances(r).map(t => `${t.locationId}|${t.datetime}`)))
                  if (toRemove.size > 0) {
                    const filtered = times.filter(t => !toRemove.has(`${t.locationId}|${t.datetime}`))
                    if (filtered.length !== times.length) {
                      times = filtered
                      nextState['times.json'] = { ...(prev['times.json'] || { dirty: false }), content: times, dirty: true }
                    }
                  }
                }

                // Add instances for newly added schedules
                if (added.length > 0) {
                  const additions = added.flatMap(a => getFourWeekWindowInstances(a))
                  const merged = uniqueTimes([ ...times, ...additions ])
                  if (merged.length !== times.length) {
                    times = merged
                    nextState['times.json'] = { ...(prev['times.json'] || { dirty: false }), content: times, dirty: true }
                  }
                }

                return nextState
              })}
            />
          ) : selected === 'live.json' ? (
            <LiveEditor
              value={(current.content as unknown as LiveEntry[]) || []}
              times={((stateByFile['times.json']?.content as unknown) as TimeEntry[]) || []}
              locations={((stateByFile['locations.json']?.content as unknown) as LocationEntry[]) || []}
              onChange={(next) => setStateByFile(prev => ({
                ...prev,
                [selected]: { ...(prev[selected] || { dirty: false }), content: next, dirty: true },
              }))}
            />
          ) : (
            <InfoEditor
              value={current.content as InfoData}
              onChange={onChange}
              onAddSection={onAddSection}
              onRemoveSection={onRemoveSection}
              onUpdateSection={onUpdateSection}
            />
          )
        )}
        </>
        )}
      </main>
    </div>
  )
}

export default App
