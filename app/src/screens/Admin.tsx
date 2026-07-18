import { useCallback, useEffect, useState } from 'react'
import { fmtTime } from '../data'
import type { User } from '../data'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Logo } from '../ui/Logo'
import { Verified } from '../ui/Verified'

type Section = 'dashboard' | 'users' | 'reports' | 'logs'

type AdminUser = User & { status: string; email: string | null; emailVerified: boolean }
type Report = {
  id: number; reason: string; details: string; status: string; createdAt: string
  reporter: string; target: { id: string; username: string; displayName: string }
}
type LogLine = { id: number; actor: string | null; action: string; target: string | null; meta: string | null; at: string }
type Stats = {
  totals: { users: number; activeUsers: number; chats: number; messages: number; calls: number; openReports: number }
  messagesPerDay: { day: string; n: number }[]
  usersPerDay: { day: string; n: number }[]
}

export function Admin() {
  const { state, dispatch, actions } = useStore()
  const me = state.me!
  const [section, setSection] = useState<Section>('dashboard')
  const nav: { id: Section; label: string; icon: string; minRole?: string[] }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'reports', label: 'Reports', icon: 'flag' },
    { id: 'logs', label: 'Logs', icon: 'database', minRole: ['admin', 'owner'] },
  ]

  return (
    <div className="overlay admin-overlay">
      <div className="admin glass-panel">
        <aside className="admin-nav">
          <div className="admin-brand">
            <Logo size={30} />
            <div><b>Libera</b><span>Admin</span></div>
          </div>
          {nav
            .filter((n) => !n.minRole || n.minRole.includes(me.role))
            .map((n) => (
              <button key={n.id} className={`admin-nav-btn${section === n.id ? ' active' : ''}`} onClick={() => setSection(n.id)}>
                <Icon name={n.icon} size={18} /> {n.label}
              </button>
            ))}
          <div className="admin-nav-foot">
            <button className="admin-nav-btn" onClick={() => dispatch({ type: 'ADMIN', on: false })}>
              <Icon name="logout" size={18} /> Exit panel
            </button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-head">
            <h2>{nav.find((n) => n.id === section)?.label}</h2>
            <div className="admin-user">
              <Avatar name={me.displayName} seed={me.id} avatar={me.avatar} size={32} />
              <span>@{me.username} · {me.role}</span>
            </div>
          </header>
          {section === 'dashboard' && <Dashboard />}
          {section === 'users' && <Users meRole={me.role} onToast={actions.toast} />}
          {section === 'reports' && <Reports onToast={actions.toast} />}
          {section === 'logs' && <Logs />}
        </main>
      </div>
    </div>
  )
}

function useLoad<T>(path: string): [T | null, string | null, () => void] {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const reload = useCallback(() => {
    api.get<T>(path).then(setData).catch((e) => setErr((e as Error).message))
  }, [path])
  useEffect(reload, [reload])
  return [data, err, reload]
}

function Dashboard() {
  const [stats, err] = useLoad<Stats>('/admin/stats')
  if (err) return <div className="admin-body"><div className="form-error">{err}</div></div>
  if (!stats) return <div className="admin-body"><div className="list-hint">Loading…</div></div>
  const cards = [
    { label: 'Registered users', value: stats.totals.users },
    { label: 'Active users', value: stats.totals.activeUsers },
    { label: 'Conversations', value: stats.totals.chats },
    { label: 'Messages', value: stats.totals.messages },
    { label: 'Calls', value: stats.totals.calls },
    { label: 'Open reports', value: stats.totals.openReports },
  ]
  const days = stats.messagesPerDay
  const max = Math.max(1, ...days.map((d) => d.n))
  return (
    <div className="admin-body">
      <div className="stat-grid">
        {cards.map((s) => (
          <div key={s.label} className="stat-card glass">
            <span className="stat-label">{s.label}</span>
            <div className="stat-row"><b>{s.value.toLocaleString()}</b></div>
          </div>
        ))}
      </div>
      <div className="panel glass">
        <div className="panel-head"><b>Messages per day</b><span>last 7 days</span></div>
        {days.length === 0 ? (
          <div className="list-hint">No messages in the last 7 days.</div>
        ) : (
          <div className="bar-chart">
            {days.map((d) => (
              <div key={d.day} className="bar-col" title={`${d.day}: ${d.n}`}>
                <div className="bar" style={{ height: `${(d.n / max) * 100}%` }} />
                <span>{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Users({ meRole, onToast }: { meRole: string; onToast: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`)
      .then((r) => setUsers(r.users))
      .catch((e) => setErr((e as Error).message))
  }, [q])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const act = async (u: AdminUser, body: Record<string, string>) => {
    try {
      await api.patch(`/admin/users/${u.id}`, body)
      onToast(`@${u.username} updated`)
      load()
    } catch (e) {
      onToast((e as Error).message)
    }
  }
  const remove = async (u: AdminUser) => {
    if (!confirm(`Delete account @${u.username}? This cannot be undone.`)) return
    try {
      await api.del(`/admin/users/${u.id}`)
      onToast(`@${u.username} deleted`)
      load()
    } catch (e) {
      onToast((e as Error).message)
    }
  }

  const isAdmin = meRole === 'admin' || meRole === 'owner'
  if (err) return <div className="admin-body"><div className="form-error">{err}</div></div>

  return (
    <div className="admin-body">
      <div className="search glass admin-search">
        <Icon name="search" size={16} />
        <input placeholder="Search by username or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="admin-table glass">
        <thead>
          <tr><th>User</th>{isAdmin && <th>Email</th>}<th>Joined</th><th>Role</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="cell-user">
                  <Avatar name={u.displayName} seed={u.id} avatar={u.avatar} size={30} />
                  <div className="cell-2l"><span className="name-row"><span className="name-text">{u.displayName}</span>{u.verified && <Verified size={14} />}</span><small>@{u.username}</small></div>
                </div>
              </td>
              {isAdmin && <td className="dim">{u.email}{u.emailVerified ? ' ✓' : ''}</td>}
              <td className="dim">{fmtTime(u.createdAt)}</td>
              <td>
                {isAdmin && u.role !== 'owner' ? (
                  <select className="select glass" value={u.role}
                          onChange={(e) => act(u, { role: e.target.value })}>
                    {['user', 'moderator', 'admin'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                ) : (
                  u.role
                )}
              </td>
              <td><span className={`pill${u.status === 'active' ? ' ok' : u.status === 'deleted' ? '' : ' bad'}`}>{u.status}</span></td>
              <td className="row-actions">
                {u.status === 'active' && u.role !== 'owner' && (
                  <>
                    <button className="table-btn warn" onClick={() => act(u, { status: 'suspended' })}>Suspend</button>
                    <button className="table-btn danger" onClick={() => act(u, { status: 'blocked' })}>Block</button>
                  </>
                )}
                {(u.status === 'blocked' || u.status === 'suspended') && (
                  <button className="table-btn" onClick={() => act(u, { status: 'active' })}>Restore</button>
                )}
                {isAdmin && u.status !== 'deleted' && u.role !== 'owner' && (
                  <button className="table-btn danger" onClick={() => remove(u)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users?.length === 0 && <div className="list-hint">No users match.</div>}
    </div>
  )
}

function Reports({ onToast }: { onToast: (m: string) => void }) {
  const [data, err, reload] = useLoad<{ reports: Report[] }>('/admin/reports')
  const act = async (id: number, status: string) => {
    try {
      await api.patch(`/admin/reports/${id}`, { status })
      reload()
    } catch (e) {
      onToast((e as Error).message)
    }
  }
  if (err) return <div className="admin-body"><div className="form-error">{err}</div></div>
  return (
    <div className="admin-body">
      {data?.reports.length === 0 && <div className="list-hint">No reports. 🎉</div>}
      {data?.reports.map((r) => (
        <div key={r.id} className={`report glass${r.status !== 'open' ? ' resolved' : ''}`}>
          <div className="report-head">
            <span className={`pill ${r.reason === 'Spam' ? 'warn' : 'bad'}`}>{r.reason}</span>
            <b>@{r.target.username}</b>
            <span className="dim">reported by @{r.reporter} · {fmtTime(r.createdAt)}</span>
          </div>
          {r.details && <p>{r.details}</p>}
          {r.status === 'open' ? (
            <div className="report-actions">
              <button className="table-btn" onClick={() => act(r.id, 'dismissed')}>Dismiss</button>
              <button className="table-btn warn" onClick={() => act(r.id, 'resolved')}>Mark resolved</button>
            </div>
          ) : (
            <span className="resolved-tag"><Icon name="check" size={14} /> {r.status}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function Logs() {
  const [data, err] = useLoad<{ logs: LogLine[] }>('/admin/logs')
  if (err) return <div className="admin-body"><div className="form-error">{err}</div></div>
  return (
    <div className="admin-body">
      <div className="panel glass logs">
        {data?.logs.length === 0 && <div className="list-hint">No log entries yet.</div>}
        {data?.logs.map((l) => (
          <div key={l.id} className="log-line">
            <span className="log-t">{fmtTime(l.at)}</span>
            <span className="pill ok">{l.action}</span>
            <span className="log-msg">
              {l.actor ? `@${l.actor}` : 'system'}{l.meta ? ` · ${l.meta}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
