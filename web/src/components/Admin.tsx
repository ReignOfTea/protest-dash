import { useEffect, useState } from 'react'
import axios from 'axios'

type Role = 'admin' | 'editor'

type UserRec = { id: string, role: Role, username?: string, discriminator?: string, avatar?: string }

export default function Admin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRec[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [newId, setNewId] = useState<string>('')
  const [newRole, setNewRole] = useState<Role>('editor')

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const resp = await axios.get('/api/admin/users')
      setUsers(resp.data?.users || [])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error || err?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addUser = async () => {
    const id = newId.trim()
    if (!id) return
    try {
      await axios.post('/api/admin/users', { id, role: newRole })
      setNewId('')
      setNewRole('editor')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      alert(err?.response?.data?.error || err?.message || 'Failed to add user')
    }
  }

  const updateRole = async (id: string, role: Role) => {
    try {
      await axios.put(`/api/admin/users/${encodeURIComponent(id)}`, { role })
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      alert(err?.response?.data?.error || err?.message || 'Failed to update role')
    }
  }

  const removeUser = async (id: string) => {
    const target = users.find(u => u.id === id)
    if (id === currentUserId && target?.role === 'admin') {
      alert('You cannot remove yourself while you are an admin.')
      return
    }
    if (!confirm('Remove this user?')) return
    try {
      await axios.delete(`/api/admin/users/${encodeURIComponent(id)}`)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      alert(err?.response?.data?.error || err?.message || 'Failed to remove user')
    }
  }

  const avatarUrl = (u: UserRec) => {
    if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
    // Default avatar (discordcdn uses a deterministic default, but we can omit)
    return `https://cdn.discordapp.com/embed/avatars/0.png`
  }

  const displayName = (u: UserRec) => {
    if (u.username) return `${u.username}${u.discriminator ? '#' + u.discriminator : ''}`
    return u.id
  }

  return (
    <div className="main" style={{ paddingTop: 0 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Admin</h1>

      {error && (
        <div style={{ color: 'white', background: '#b00020', padding: '8px 12px', borderRadius: 10, marginBottom: 16 }}>
          {String(error)}
        </div>
      )}

      <section className="section-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Add user</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Discord ID"
            value={newId}
            onChange={e => setNewId(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <select value={newRole} onChange={e => setNewRole((e.target.value as Role) || 'editor')}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={addUser}>Add</button>
        </div>
      </section>

      <section className="section-card">
        <h2 style={{ marginTop: 0 }}>Users</h2>
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => (
              <div key={u.id} className="section-card" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={avatarUrl(u)} alt="avatar" width={28} height={28} style={{ borderRadius: 9999 }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong>{displayName(u)}</strong>
                    <code style={{ opacity: 0.7 }}>{u.id}</code>
                  </div>
                  <select value={u.role} onChange={e => updateRole(u.id, (e.target.value as Role) || 'editor')}>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  style={{ background: '#ef4444' }}
                  onClick={() => removeUser(u.id)}
                  disabled={u.id === currentUserId && u.role === 'admin'}
                  title={u.id === currentUserId && u.role === 'admin' ? 'Cannot remove yourself while admin' : undefined}
                >
                  Remove
                </button>
              </div>
            ))}
            {users.length === 0 && (
              <div style={{ color: 'var(--muted)' }}>No users yet.</div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}


