import { useEffect, useRef, useState } from 'react'
import { fmtLastSeen, fmtTime, preview } from '../data'
import type { Chat, User } from '../data'
import { api } from '../lib/api'
import { useStore, tickFor } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Logo } from '../ui/Logo'

export function Chats() {
  const { state, actions } = useStore()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<User[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [profile, setProfile] = useState<User | null>(null)
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
          <h1>Chats</h1>
        </div>
        <div className="search glass">
          <Icon name="search" size={17} />
          <input
            placeholder="Search people by @username or name"
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
            <div className="list-label">People on Libera</div>
            {searching && <div className="list-hint">Searching…</div>}
            {!searching && found?.length === 0 && <div className="list-hint">No users found for “{q.trim()}”.</div>}
            {found?.map((u) => (
              <button key={u.id} className="row" onClick={() => setProfile(u)}>
                <Avatar name={u.displayName} seed={u.id} avatar={u.avatar} size={48} online={u.online} />
                <div className="row-main">
                  <span className="row-name">{u.displayName}</span>
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
            <p><b>No conversations yet</b></p>
            <span>Search for a friend by <b>@username</b> above to start your first chat. Messages are private between you and them.</span>
          </div>
        )}
      </div>

      {profile && <ProfileSheet user={profile} onClose={() => setProfile(null)} />}
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
        <span className="row-name">{chat.peer.displayName}</span>
        <span className={`row-preview${chat.typing ? ' typing' : ''}`}>
          {chat.typing ? 'typing…' : (
            <>
              {mine && last && <span className="you">You: </span>}
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
      actions.toast('Report sent to the moderation team')
      setReporting(false)
    } catch (e) {
      actions.toast((e as Error).message)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="profile-view">
        <Avatar name={user.displayName} seed={user.id} avatar={user.avatar} size={84} online={user.online} />
        <b>{user.displayName}</b>
        <span className="uname">@{user.username}</span>
        {user.bio && <p className="bio">{user.bio}</p>}
        <span className="presence">{user.online ? 'online' : fmtLastSeen(user.lastSeenAt)}</span>
        {user.id !== state.me?.id && (
          <div className="profile-actions">
            <button className="btn primary" disabled={busy} onClick={startChat}>
              <Icon name="chat" size={18} /> Message
            </button>
            {!reporting ? (
              <button className="btn glass danger-text" onClick={() => setReporting(true)}>
                <Icon name="flag" size={17} /> Report
              </button>
            ) : (
              <div className="report-form">
                <select className="select glass" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {['Spam', 'Abuse', 'Impersonation', 'Other'].map((r) => <option key={r}>{r}</option>)}
                </select>
                <button className="btn glass" onClick={sendReport}>Send report</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
