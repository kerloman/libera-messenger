import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { accents, daysUntil, fmtDate, wallpapers } from '../data'
import type { Me } from '../data'
import { api } from '../lib/api'
import { useStore as useAppStore } from '../store'
import type { Prefs } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Verified } from '../ui/Verified'
import { Privacy } from './Privacy'
import { t, t as t2, tDays, tMonths } from '../lib/i18n'
import type { LangPref } from '../lib/i18n'
import { SoundsHaptics } from './SoundsHaptics'

type Session = { id: number; userAgent: string | null; createdAt: string; current: boolean }

export function Settings() {
  const { state, dispatch, actions } = useAppStore()
  const me = state.me!
  const p = state.prefs
  const [editOpen, setEditOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [soundOpen, setSoundOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)

  const cancelScheduledDeletion = async () => {
    try {
      await api.del('/me/schedule-deletion')
      dispatch({ type: 'SET_ME', me: { ...me, deleteScheduledAt: null } })
      actions.toast(t('deletionScheduledCancelled'))
    } catch (e) {
      actions.toast((e as Error).message)
    }
  }

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => dispatch({ type: 'PREF', key, value })

  useEffect(() => {
    api.get<{ sessions: Session[] }>('/me/sessions').then((r) => setSessions(r.sessions)).catch(() => setSessions([]))
  }, [])

  const uploadAvatar = async (f: File | undefined) => {
    if (!f) return
    try {
      const { avatar } = (await (async () => {
        const form = new FormData()
        form.append('file', f)
        return api.post<{ avatar: string }>('/me/avatar', form)
      })())
      dispatch({ type: 'SET_ME', me: { ...me, avatar } })
      actions.toast(t('photoUpdated'))
    } catch (e) {
      actions.toast((e as Error).message)
    }
  }

  const exportData = async () => {
    const res = await fetch('/api/me/export', { credentials: 'include' })
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'libera-export.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const askNotifications = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        actions.toast(t('notifBlocked'))
        return set('notifications', false)
      }
    }
    set('notifications', on)
  }

  const canAdmin = ['moderator', 'admin', 'owner'].includes(me.role)

  return (
    <div className="screen settings">
      <header className="screen-head">
        <div className="head-row">
          <h1>{t('settings')}</h1>
        </div>
      </header>

      <div className="settings-scroll">
        {me.deleteScheduledAt && (
          <div className="sched-banner glass">
            <Icon name="clock" size={18} />
            <div>
              <b>{t('deletionScheduled')}</b>
              <span className="sub">
                {tDays(daysUntil(me.deleteScheduledAt))} — {t('daysLeftDeletes')} {fmtDate(me.deleteScheduledAt)}. {t('keepUsing')}
              </span>
            </div>
            <button className="cancel" onClick={cancelScheduledDeletion}>{t('cancel')}</button>
          </div>
        )}
        {!me.emailVerified && (
          <div className="verify-banner glass">
            <Icon name="info" size={16} />
            <span>
              {t('verifyEmailBanner')} <b>{me.email}</b>.
            </span>
          </div>
        )}

        <div className="profile-card glass">
          <button className="avatar-btn" onClick={() => avatarInput.current?.click()} title={t('changePhoto')}>
            <Avatar name={me.displayName} seed={me.id} avatar={me.avatar} size={72} online />
            <span className="avatar-edit"><Icon name="camera" size={13} /></span>
          </button>
          <div className="profile-info">
            <b className="name-row"><span className="name-text">{me.displayName}</span>{me.verified && <Verified size={17} />}</b>
            <span className="uname">@{me.username}</span>
            {me.bio && <span className="bio">{me.bio}</span>}
          </div>
          <button className="icon-btn" onClick={() => setEditOpen(true)}><Icon name="pencil" size={17} /></button>
        </div>
        <input ref={avatarInput} type="file" accept="image/*" hidden
               onChange={(e) => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }} />

        <Group label={t('appearance')}>
          <Row icon="moon" tint="#5E5CE6" label={t('theme')}>
            <div className="seg glass">
              {(['auto', 'light', 'dark'] as const).map((th) => (
                <button key={th} className={p.theme === th ? 'on' : ''} onClick={() => set('theme', th)}>
                  {({ auto: t2('themeAuto'), light: t2('themeLight'), dark: t2('themeDark') } as const)[th]}
                </button>
              ))}
            </div>
          </Row>
          <Row icon="globe" tint="#0A84FF" label={t('language')}>
            <select
              className="select glass"
              value={me.language ?? p.language}
              onChange={async (e) => {
                const v = e.target.value as LangPref
                set('language', v)
                // persist on the account so it syncs to every device instantly
                try {
                  const { user } = await api.patch<{ user: Me }>('/me', { language: v === 'auto' ? null : v })
                  dispatch({ type: 'SET_ME', me: user })
                } catch { /* local pref still applies */ }
              }}
            >
              <option value="auto">{t('langAuto')}</option>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </Row>
          <Row icon="palette" tint="#FF9F0A" label={t('accentColor')}>
            <div className="swatches">
              {Object.entries(accents).map(([name, [a, b]]) => (
                <button key={name} title={name}
                        className={`swatch${p.accent === name ? ' on' : ''}`}
                        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                        onClick={() => set('accent', name as Prefs['accent'])} />
              ))}
            </div>
          </Row>
          <Row icon="typesize" tint="#32ADE6" label={t('textSize')}>
            <input className="slider" type="range" min="0.85" max="1.25" step="0.05"
                   value={p.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))} />
          </Row>
          <Row icon="photo" tint="#30C465" label={t('chatWallpaper')}>
            <div className="wp-thumbs">
              {wallpapers.map((w) => (
                <button key={w} className={`wp-thumb wp-${w}${p.wallpaper === w ? ' on' : ''}`}
                        onClick={() => set('wallpaper', w)} title={w} />
              ))}
            </div>
          </Row>
        </Group>

        <Group label={t('notifications')}>
          <Row icon="bell" tint="#FF4D5E" label={t('messageNotifications')} sub={t('messageNotificationsSub')}>
            <Toggle on={p.notifications} onChange={askNotifications} />
          </Row>
          <Row icon="speaker" tint="#BF5AF2" label={t('soundsHaptics')} sub={t('soundsHapticsSub')} chevron onClick={() => setSoundOpen(true)} />
        </Group>

        <Group label={t('privacySecurity')}>
          <Row icon="lock" tint="#0A84FF" label={t('privacySecurity')} sub={t('privacySecuritySub')} chevron onClick={() => setPrivacyOpen(true)} />
          <Row icon="key" tint="#5E5CE6" label={t('changePassword')} chevron onClick={() => setPwOpen(true)} />
          {sessions?.map((s) => (
            <Row key={s.id} icon="devices" tint={s.current ? '#30C465' : '#8E8E93'}
                 label={s.current ? t('thisDevice') : shortAgent(s.userAgent)}
                 sub={`${t('signedIn')} ${new Date(s.createdAt + 'Z').toLocaleDateString()}`}>
              {!s.current && (
                <button className="link-btn danger"
                        onClick={async () => {
                          await api.del(`/me/sessions/${s.id}`)
                          setSessions(sessions.filter((x) => x.id !== s.id))
                          actions.toast(t('sessionTerminated'))
                        }}>
                  {t('end')}
                </button>
              )}
            </Row>
          ))}
        </Group>

        <Group label={t('data')}>
          <Row icon="download" tint="#30C465" label={t('exportMyData')} sub={t('exportSub')} chevron onClick={exportData} />
        </Group>

        {canAdmin && (
          <Group label={t('workspace')}>
            <Row icon="shield" tint="#FF4D5E" label={t('adminPanel')} sub={`${t('signedInAs')} ${me.role}`} chevron
                 onClick={() => dispatch({ type: 'ADMIN', on: true })} />
          </Group>
        )}

        <Group label={t('accountManagement')}>
          <div className="set-row danger-zone tappable" onClick={() => setDeleteOpen(true)}>
            <div className="set-ic"><Icon name="trash" size={17} stroke={2} /></div>
            <div className="set-main">
              <span>{t('deleteAccount')}</span>
              <small>{me.deleteScheduledAt ? `${t('scheduledDaysLeft')} ${tDays(daysUntil(me.deleteScheduledAt))}` : t('deleteNowOrSchedule')}</small>
            </div>
            <Icon name="chevR" size={15} className="chev" />
          </div>
        </Group>

        <button className="logout-btn glass" onClick={() => actions.logout()}>{t('logOut')}</button>
        <p className="version">{t('versionLine')}</p>
      </div>

      {editOpen && <EditProfile me={me} onClose={() => setEditOpen(false)} />}
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
      {privacyOpen && <Privacy onClose={() => setPrivacyOpen(false)} />}
      {soundOpen && <SoundsHaptics onClose={() => setSoundOpen(false)} />}
      {deleteOpen && <DeleteAccount onClose={() => setDeleteOpen(false)} />}
    </div>
  )
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { state, dispatch, actions } = useAppStore()
  const me = state.me!
  const [mode, setMode] = useState<'schedule' | 'now'>(me.deleteScheduledAt ? 'schedule' : 'schedule')
  const [months, setMonths] = useState(3)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const periods = [1, 3, 6, 12, 18, 24]

  const schedule = async () => {
    setErr(null); setBusy(true)
    try {
      const { deleteScheduledAt } = await api.post<{ deleteScheduledAt: string }>('/me/schedule-deletion', { months })
      dispatch({ type: 'SET_ME', me: { ...me, deleteScheduledAt } })
      actions.toast(`${t('deletionScheduledIn')} ${tMonths(months)}`)
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await api.del('/me/schedule-deletion')
      dispatch({ type: 'SET_ME', me: { ...me, deleteScheduledAt: null } })
      actions.toast(t('deletionScheduledCancelled'))
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const deleteNow = async () => {
    setErr(null); setBusy(true)
    try {
      await api.post('/me/delete', { password })
      actions.toast(t('accountDeleted'))
      dispatch({ type: 'SET_ME', me: null })
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} title={t('deleteAccount')}>
      {err && <div className="form-error">{err}</div>}

      {me.deleteScheduledAt && (
        <div className="sched-banner" style={{ marginBottom: 14 }}>
          <Icon name="clock" size={18} />
          <div>
            <b>{t('deletionScheduled')}</b>
            <span className="sub">{tDays(daysUntil(me.deleteScheduledAt))} · {fmtDate(me.deleteScheduledAt)}</span>
          </div>
        </div>
      )}

      <div className="del-tabs">
        <button className={`del-tab${mode === 'schedule' ? ' on' : ''}`} onClick={() => setMode('schedule')}>{t('schedule')}</button>
        <button className={`del-tab${mode === 'now' ? ' on' : ''}`} onClick={() => setMode('now')}>{t('deleteNow')}</button>
      </div>

      <div className="del-warn">
        {t('deleteWarn')}
      </div>

      {mode === 'schedule' ? (
        <>
          <p className="group-label" style={{ paddingLeft: 2 }}>{t('deleteAfter')}</p>
          <div className="del-periods">
            {periods.map((m) => (
              <button key={m} className={`del-period${months === m ? ' on' : ''}`} onClick={() => setMonths(m)}>
                {tMonths(m)}
              </button>
            ))}
          </div>
          <button className="btn danger-solid" disabled={busy} onClick={schedule}>
            {me.deleteScheduledAt ? t('updateScheduledDate') : t('scheduleDeletion')}
          </button>
          {me.deleteScheduledAt && (
            <button className="btn glass" style={{ marginTop: 8 }} disabled={busy} onClick={cancel}>
              {t('cancelScheduledDeletion')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="field glass">
            <Icon name="key" size={18} />
            <input type="password" placeholder={t('confirmYourPassword')} value={password}
                   onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn danger-solid" style={{ marginTop: 12 }} disabled={busy || !password} onClick={deleteNow}>
            {busy ? t('deleting') : t('permanentlyDelete')}
          </button>
        </>
      )}
    </Sheet>
  )
}

function shortAgent(ua: string | null) {
  if (!ua) return t('unknownDevice')
  if (ua.includes('iPhone')) return 'iPhone'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('Mac')) return 'Mac'
  if (ua.includes('Windows')) return 'Windows'
  return ua.slice(0, 30)
}

function EditProfile({ me, onClose }: { me: Me; onClose: () => void }) {
  const { dispatch, actions } = useAppStore()
  const [displayName, setDisplayName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    try {
      const { user } = await api.patch<{ user: Me }>('/me', { displayName, bio })
      dispatch({ type: 'SET_ME', me: user })
      actions.toast(t('profileUpdated'))
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Sheet onClose={onClose} title={t('editProfile')}>
      {err && <div className="form-error">{err}</div>}
      <div className="form-col">
        <label>{t('displayName')}</label>
        <div className="field glass"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <label>{t('bio')}</label>
        <div className="field glass"><input value={bio} placeholder={t('bioPlaceholder')} onChange={(e) => setBio(e.target.value)} /></div>
        <button className="btn primary" onClick={save} disabled={!displayName.trim()}>{t('save')}</button>
      </div>
    </Sheet>
  )
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { actions } = useAppStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    try {
      await api.post('/me/password', { current, next })
      actions.toast(t('passwordChanged'))
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Sheet onClose={onClose} title={t('changePassword')}>
      {err && <div className="form-error">{err}</div>}
      <div className="form-col">
        <label>{t('currentPassword')}</label>
        <div className="field glass"><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <label>{t('newPasswordMin8')}</label>
        <div className="field glass"><input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <button className="btn primary" onClick={save} disabled={!current || next.length < 8}>{t('changePassword')}</button>
      </div>
    </Sheet>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <span className="group-label">{label}</span>
      <div className="group-card glass">{children}</div>
    </div>
  )
}

function Row({
  icon, tint, label, sub, children, chevron, onClick,
}: {
  icon: string; tint: string; label: string; sub?: string; children?: ReactNode; chevron?: boolean; onClick?: () => void
}) {
  return (
    <div className={`set-row${onClick ? ' tappable' : ''}`} onClick={onClick}>
      <div className="set-ic" style={{ background: tint }}><Icon name={icon} size={17} stroke={2} /></div>
      <div className="set-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="set-side">{children}{chevron && <Icon name="chevR" size={15} className="chev" />}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="knob" />
    </button>
  )
}
