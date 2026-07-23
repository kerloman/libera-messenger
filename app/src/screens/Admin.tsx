import { useCallback, useEffect, useState } from 'react'
import { fmtTime } from '../data'
import type { User } from '../data'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Logo } from '../ui/Logo'
import { Verified } from '../ui/Verified'
import { t } from '../lib/i18n'

type Section = 'dashboard' | 'users' | 'reports' | 'logs'

type AdminUser = User & { status: string; email: string | null; emailVerified: boolean; realOnline: boolean; realLastSeenAt: string | null }
type SecurityDetail = {
  online: boolean; lastSeenAt: string | null; lastLoginAt: string | null; activeSessions: number
  sessions: { platform: string; device: string; ip: string | null; createdAt: string }[]
}
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
    { id: 'dashboard', label: t('dashboard'), icon: 'chart' },
    { id: 'users', label: t('usersNav'), icon: 'users' },
    { id: 'reports', label: t('reports'), icon: 'flag' },
    { id: 'logs', label: t('logs'), icon: 'database', minRole: ['admin', 'owner'] },
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
              <Icon name="logout" size={18} /> {t('exitPanel')}
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
  if (!stats) return <div className="admin-body"><div className="list-hint">{t('loading')}</div></div>
  const cards = [
    { label: t('registeredUsers'), value: stats.totals.users },
    { label: t('activeUsers'), value: stats.totals.activeUsers },
    { label: t('conversations'), value: stats.totals.chats },
    { label: t('messagesStat'), value: stats.totals.messages },
    { label: t('callsStat'), value: stats.totals.calls },
    { label: t('openReports'), value: stats.totals.openReports },
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
        <div className="panel-head"><b>{t('messagesPerDay')}</b><span>{t('last7Days')}</span></div>
        {days.length === 0 ? (
          <div className="list-hint">{t('noMessages7d')}</div>
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
  const [securityFor, setSecurityFor] = useState<AdminUser | null>(null)

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
      onToast(`@${u.username} ${t('updated')}`)
      load()
    } catch (e) {
      onToast((e as Error).message)
    }
  }
  const remove = async (u: AdminUser) => {
    if (!confirm(`${t('deleteUserConfirm1')} @${u.username}? ${t('deleteUserConfirm2')}`)) return
    try {
      await api.del(`/admin/users/${u.id}`)
      onToast(`@${u.username} ${t('deletedToast')}`)
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
        <input placeholder={t('adminSearchUsers')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table className="admin-table glass">
        <thead>
          <tr><th>{t('colUser')}</th>{isAdmin && <th>{t('colEmail')}</th>}<th>{t('colLastActive')}</th><th>{t('colRole')}</th><th>{t('colStatus')}</th><th /></tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="cell-user">
                  <span className={`admin-dot${u.realOnline ? ' on' : ''}`} title={u.realOnline ? t('onlineNow') : t('offline')} />
                  <Avatar name={u.displayName} seed={u.id} avatar={u.avatar} size={30} />
                  <div className="cell-2l"><span className="name-row"><span className="name-text">{u.displayName}</span>{u.verified && <Verified size={14} />}</span><small>@{u.username}</small></div>
                </div>
              </td>
              {isAdmin && <td className="dim">{u.email}{u.emailVerified ? ' ✓' : ''}</td>}
              <td className="dim">{u.realOnline ? t('online') : u.realLastSeenAt ? fmtTime(u.realLastSeenAt) : '—'}</td>
              <td>
                {isAdmin && u.role !== 'owner' ? (
                  <select className="select glass" value={u.role}
                          onChange={(e) => act(u, { role: e.target.value })}>
                    {([['user', t('roleUser')], ['moderator', t('roleModerator')], ['admin', t('roleAdmin')]] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  u.role
                )}
              </td>
              <td><span className={`pill${u.status === 'active' ? ' ok' : u.status === 'deleted' ? '' : ' bad'}`}>{({ active: t('statusActive'), blocked: t('statusBlocked'), suspended: t('statusSuspended'), deleted: t('statusDeleted') } as Record<string, string>)[u.status] ?? u.status}</span></td>
              <td className="row-actions">
                <button className="table-btn" onClick={() => setSecurityFor(u)}>{t('sessions')}</button>
                {u.status === 'active' && u.role !== 'owner' && (
                  <>
                    <button className="table-btn warn" onClick={() => act(u, { status: 'suspended' })}>{t('suspend')}</button>
                    <button className="table-btn danger" onClick={() => act(u, { status: 'blocked' })}>{t('blockAdmin')}</button>
                  </>
                )}
                {(u.status === 'blocked' || u.status === 'suspended') && (
                  <button className="table-btn" onClick={() => act(u, { status: 'active' })}>{t('restore')}</button>
                )}
                {isAdmin && u.status !== 'deleted' && u.role !== 'owner' && (
                  <button className="table-btn danger" onClick={() => remove(u)}>{t('deleteAdmin')}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users?.length === 0 && <div className="list-hint">{t('noUsersMatch')}</div>}
      {securityFor && <SecurityModal user={securityFor} onClose={() => setSecurityFor(null)} />}
    </div>
  )
}

function SecurityModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [data, err] = useLoad<SecurityDetail>(`/admin/users/${user.id}/security`)
  return (
    <div className="overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div className="sec-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ justifyContent: 'space-between' }}>
          <b>@{user.username} · {t('security')}</b>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {err && <div className="form-error">{err}</div>}
        {!data ? <div className="list-hint">{t('loading')}</div> : (
          <>
            <div className="sec-grid">
              <div><small>{t('status')}</small><b className={data.online ? 'on' : ''}>{data.online ? t('onlineNow') : t('offline')}</b></div>
              <div><small>{t('exactLastSeen')}</small><b>{data.lastSeenAt ? fmtTime(data.lastSeenAt) : '—'}</b></div>
              <div><small>{t('lastLogin')}</small><b>{data.lastLoginAt ? fmtTime(data.lastLoginAt) : '—'}</b></div>
              <div><small>{t('activeSessions')}</small><b>{data.activeSessions}</b></div>
            </div>
            <div className="sec-note"><Icon name="shield" size={13} /> {t('moderationView')}</div>
            <div className="sec-sessions">
              {data.sessions.map((s, i) => (
                <div key={i} className="sec-session">
                  <Icon name="devices" size={17} />
                  <div className="sec-s-main">
                    <b>{s.platform}</b>
                    <small>{s.device}</small>
                  </div>
                  <div className="sec-s-meta">
                    <span>{s.ip ?? t('ipNa')}</span>
                    <small>{fmtTime(s.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
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
      {data?.reports.length === 0 && <div className="list-hint">{t('noReports')}</div>}
      {data?.reports.map((r) => (
        <div key={r.id} className={`report glass${r.status !== 'open' ? ' resolved' : ''}`}>
          <div className="report-head">
            <span className={`pill ${r.reason === 'Spam' ? 'warn' : 'bad'}`}>{r.reason}</span>
            <b>@{r.target.username}</b>
            <span className="dim">{t('reportedBy')} @{r.reporter} · {fmtTime(r.createdAt)}</span>
          </div>
          {r.details && <p>{r.details}</p>}
          {r.status === 'open' ? (
            <div className="report-actions">
              <button className="table-btn" onClick={() => act(r.id, 'dismissed')}>{t('dismiss')}</button>
              <button className="table-btn warn" onClick={() => act(r.id, 'resolved')}>{t('markResolved')}</button>
            </div>
          ) : (
            <span className="resolved-tag"><Icon name="check" size={14} /> {r.status === 'resolved' ? t('resolved') : t('dismissed')}</span>
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
        {data?.logs.length === 0 && <div className="list-hint">{t('noLogs')}</div>}
        {data?.logs.map((l) => (
          <div key={l.id} className="log-line">
            <span className="log-t">{fmtTime(l.at)}</span>
            <span className="pill ok">{l.action}</span>
            <span className="log-msg">
              {l.actor ? `@${l.actor}` : t('system')}{l.meta ? ` · ${l.meta}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
