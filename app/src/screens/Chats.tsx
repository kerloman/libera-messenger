import { useEffect, useRef, useState } from 'react'
import { fmtLastSeen, fmtTime, preview } from '../data'
import type { Chat, User } from '../data'
import { api } from '../lib/api'
import { useStore, tickFor } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Logo } from '../ui/Logo'
import { Verified } from '../ui/Verified'
import { t } from '../lib/i18n'

export function Chats() {
  const { state, actions } = useStore()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<User[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [profile, setProfile] = useState<User | null>(null)
  const [plusOpen, setPlusOpen] = useState(false)
  const [newChat, setNewChat] = useState(false)
  const timer = useRef(0)

  // server-side people search, debounced
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setFound(null)
      return
    }
    setSearching(true)
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.get<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`)
        setFound(r.users)
      } catch {
        setFound([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [q])

  const localMatches = q.trim()
    ? state.chats.filter(
        (c) =>
          c.peer.displayName.toLowerCase().includes(q.toLowerCase()) ||
          c.peer.username.toLowerCase().includes(q.toLowerCase().replace(/^@/, '')),
      )
    : state.chats

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="head-row">
          <h1>{t('chats')}</h1>
          <button className="icon-btn glass compose-btn" onClick={() => setPlusOpen(true)} title={t('newMenu')}>
            <Icon name="plus" size={20} stroke={2.2} />
          </button>
        </div>
        <div className="search glass">
          <Icon name="search" size={17} />
          <input
            placeholder={t('searchPeople')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="clear" onClick={() => setQ('')}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </header>

      <div className="list">
        {localMatches.map((c) => (
          <ChatRow key={c.id} chat={c} onOpen={() => actions.openChat(c.id)} />
        ))}

        {q.trim().length >= 2 && (
          <>
            <div className="list-label">{t('peopleOnLibera')}</div>
            {searching && <div className="list-hint">{t('searching')}</div>}
            {!searching && found?.length === 0 && <div className="list-hint">{t('noUsersFoundFor')} “{q.trim()}”.</div>}
            {found?.map((u) => (
              <button key={u.id} className="row" onClick={() => setProfile(u)}>
                <Avatar name={u.displayName} seed={u.id} avatar={u.avatar} size={48} online={u.online} />
                <div className="row-main">
                  <span className="row-name name-row">
                    <span className="name-text">{u.displayName}</span>
                    {u.verified && <Verified size={15} />}
                  </span>
                  <span className="row-preview">@{u.username}</span>
                </div>
                <Icon name="chevR" size={16} className="chev" />
              </button>
            ))}
          </>
        )}

        {state.chats.length === 0 && !q.trim() && (
          <div className="empty-list">
            <Logo size={64} />
            <p><b>{t('noConversations')}</b></p>
            <span>{t('emptyChatsHint')}</span>
          </div>
        )}
      </div>

      {profile && <ProfileSheet user={profile} onClose={() => setProfile(null)} />}

      {plusOpen && (
        <Sheet onClose={() => setPlusOpen(false)} title={t('newMenu')}>
          <div className="sheet-actions">
            {([
              { icon: 'chat', label: t('newChat'), sub: t('newChatSub'), ready: true, act: () => { setPlusOpen(false); setNewChat(true) } },
              { icon: 'users', label: t('newGroup'), sub: t('comingSoon'), ready: false },
              { icon: 'speaker', label: t('newChannel'), sub: t('comingSoon'), ready: false },
              { icon: 'sparkles', label: t('newBot'), sub: t('comingSoon'), ready: false },
              { icon: 'photo', label: t('newStory'), sub: t('comingSoon'), ready: false },
            ] as const).map((o) => (
              <button
                key={o.label}
                className={`sheet-btn plus-item${o.ready ? '' : ' soon'}`}
                onClick={() => o.ready ? o.act() : actions.toast(`${o.label} ${t('comingSoonToast')}`)}
              >
                <Icon name={o.icon} size={20} />
                <div className="plus-text"><b>{o.label}</b><small>{o.sub}</small></div>
                {o.ready && <Icon name="chevR" size={15} className="chev" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {newChat && (
        <Sheet onClose={() => setNewChat(false)} title={t('newChat')}>
          <NewChatSearch onPick={(u) => { setNewChat(false); setProfile(u) }} />
        </Sheet>
      )}
    </div>
  )
}

function ChatRow({ chat, onOpen }: { chat: Chat; onOpen: () => void }) {
  const { state } = useStore()
  const last = chat.lastMessage
  const mine = last?.senderId === state.me?.id
  return (
    <div className={`row chat-row${state.activeChat === chat.id ? ' active' : ''}`} onClick={onOpen}>
      <Avatar name={chat.peer.displayName} seed={chat.peer.id} avatar={chat.peer.avatar} size={54} online={chat.peer.online} />
      <div className="row-main">
        <span className="row-name name-row">
          <span className="name-text">{chat.peer.displayName}</span>
          {chat.peer.verified && <Verified size={15} />}
        </span>
        <span className={`row-preview${chat.typing ? ' typing' : ''}`}>
          {chat.typing ? t('typing') : (
            <>
              {mine && last && <span className="you">{t('you')}: </span>}
              {preview(last)}
            </>
          )}
        </span>
      </div>
      <div className="row-side">
        <span className={`row-time${chat.unread > 0 ? ' accent' : ''}`}>{fmtTime(last?.createdAt)}</span>
        {chat.unread > 0 ? (
          <span className="badge">{chat.unread}</span>
        ) : mine && last && !last.deleted ? (
          <Icon name={tickFor(chat, last) === 'sent' ? 'check' : 'checks'} size={15}
                className={`tick${tickFor(chat, last) === 'read' ? ' read' : ''}`} />
        ) : null}
      </div>
    </div>
  )
}

export function ProfileSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const { state, dispatch, actions } = useStore()
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('Spam')

  const startChat = async () => {
    setBusy(true)
    try {
      const { chat } = await api.post<{ chat: Chat }>('/chats', { userId: user.id })
      dispatch({ type: 'CHAT_UPSERT', chat })
      onClose()
      await actions.openChat(chat.id)
    } catch (e) {
      actions.toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const sendReport = async () => {
    try {
      await api.post('/reports', { username: user.username, reason: reportReason })
      actions.toast(t('reportSentModeration'))
      setReporting(false)
    } catch (e) {
      actions.toast((e as Error).message)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="profile-view">
        <Avatar name={user.displayName} seed={user.id} avatar={user.avatar} size={84} online={user.online} />
        <b className="name-row"><span className="name-text">{user.displayName}</span>{user.verified && <Verified size={18} />}</b>
        <span className="uname">@{user.username}</span>
        {user.bio && <p className="bio">{user.bio}</p>}
        <span className="presence">{user.online ? t('online') : fmtLastSeen(user.lastSeenAt, user.lastSeenLabel)}</span>
        {user.id !== state.me?.id && (
          <div className="profile-actions">
            <button className="btn primary" disabled={busy} onClick={startChat}>
              <Icon name="chat" size={18} /> {t('message')}
            </button>
            {!reporting ? (
              <button className="btn glass danger-text" onClick={() => setReporting(true)}>
                <Icon name="flag" size={17} /> {t('report')}
              </button>
            ) : (
              <div className="report-form">
                <select className="select glass" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {([['Spam', t('reasonSpam')], ['Abuse', t('reasonAbuse')], ['Impersonation', t('reasonImpersonation')], ['Other', t('reasonOther')]] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn glass" onClick={sendReport}>{t('sendReport')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function NewChatSearch({ onPick }: { onPick: (u: User) => void }) {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<User[] | null>(null)
  const [contacts, setContacts] = useState<User[]>([])
  const [busy, setBusy] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    api.get<{ contacts: User[] }>('/contacts').then((r) => setContacts(r.contacts)).catch(() => {})
  }, [])

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (q.trim().length < 2) { setUsers(null); return }
    setBusy(true)
    timer.current = window.setTimeout(async () => {
      try { setUsers((await api.get<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`)).users) }
      catch { setUsers([]) } finally { setBusy(false) }
    }, 300)
  }, [q])

  const list = q.trim().length >= 2 ? users : contacts
  const label = q.trim().length >= 2 ? t('searchResults') : t('contacts')

  return (
    <>
      <div className="search glass" style={{ marginBottom: 10 }}>
        <Icon name="search" size={16} />
        <input autoFocus placeholder={t('searchByUsername')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sheet-list">
        <div className="list-label" style={{ paddingLeft: 4 }}>{label}</div>
        {busy && <div className="list-hint">{t('searching')}</div>}
        {list?.length === 0 && !busy && (
          <div className="list-hint">{q.trim().length >= 2 ? t('noUsersFound') : t('noContactsYet')}</div>
        )}
        {list?.map((u) => (
          <button key={u.id} className="row" onClick={() => onPick(u)}>
            <Avatar name={u.displayName} seed={u.id} avatar={u.avatar} size={44} online={u.online} />
            <div className="row-main">
              <span className="row-name name-row"><span className="name-text">{u.displayName}</span>{u.verified && <Verified size={14} />}</span>
              <span className="row-preview">@{u.username}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
