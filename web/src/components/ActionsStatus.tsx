import { useEffect, useState } from 'react'
import axios from 'axios'

type Run = {
  id: number
  name: string
  event: string
  status: 'queued' | 'in_progress' | 'completed' | string
  conclusion: 'success' | 'failure' | 'cancelled' | null | string
  html_url: string
  created_at: string
  updated_at: string
}

type Job = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at?: string
  completed_at?: string
}

export default function ActionsStatus() {
  const [run, setRun] = useState<Run | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: any
    const load = async () => {
      try {
        const resp = await axios.get('/api/actions/latest')
        if (cancelled) return
        setRun(resp.data?.run || null)
        setJobs(resp.data?.jobs || [])
        setError(null)
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Failed to load pipeline status')
      } finally {
        timer = setTimeout(load, 10000)
      }
    }
    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  if (error) {
    return (
      <div className="section-card" style={{ marginTop: 0 }}>
        <div style={{ color: '#fca5a5' }}>Actions: {error}</div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="section-card" style={{ marginTop: 0 }}>
        <div style={{ color: '#94a3b8' }}>No recent pipeline run.</div>
      </div>
    )
  }

  const statusColor = run.status === 'in_progress' ? '#f59e0b' : run.conclusion === 'success' ? '#10b981' : run.conclusion ? '#ef4444' : '#94a3b8'

  return (
    <div className="section-card" style={{ marginTop: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Latest pipeline</strong>
        <a href={run.html_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>Open</a>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ padding: '2px 8px', borderRadius: 9999, background: statusColor }}>{run.status === 'completed' ? (run.conclusion || 'completed') : run.status}</span>
        <span style={{ color: '#94a3b8' }}>{new Date(run.created_at).toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {jobs.map(j => {
          const jc = j.status === 'in_progress' ? '#f59e0b' : j.conclusion === 'success' ? '#10b981' : j.conclusion ? '#ef4444' : '#94a3b8'
          return (
            <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{j.name}</span>
              <span style={{ padding: '2px 8px', borderRadius: 9999, background: jc }}>{j.status === 'completed' ? (j.conclusion || 'completed') : j.status}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


