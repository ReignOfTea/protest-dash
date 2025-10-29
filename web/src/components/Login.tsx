import { useEffect } from 'react'

export type User = {
  id: string
  username: string
  discriminator: string
  avatar?: string
}

export default function Login() {
  const handleLogin = () => {
    // In production, API is on the same domain. In dev, Vite proxy handles /auth routes
    window.location.href = '/auth/discord'
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'unauthorized') {
      const userId = params.get('userId')
      const message = userId ? `Access denied. Your Discord ID (${userId}) is not authorized.` : 'Access denied. Your Discord ID is not authorized.'
      alert(message)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  return (
    <div className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="section-card" style={{ maxWidth: 400, textAlign: 'center' }}>
        <h1 style={{ marginTop: 0 }}>Dashboard Login</h1>
        <p>Please log in with Discord to continue.</p>
        <button onClick={handleLogin} style={{ background: '#5865F2', width: '100%', marginTop: 16 }}>
          Login with Discord
        </button>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
          Note: If you're rate limited, enable DEV_BYPASS_AUTH=true in your .env file
        </p>
      </div>
    </div>
  )
}
