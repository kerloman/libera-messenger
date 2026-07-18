import { useEffect, useState } from 'react'
import { fmtDate, fmtDuration, fmtLastSeen, fmtSize } from '../data'
import type { Chat, Message, Profile } from '../data'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Verified } from '../ui/Verified'

type Media = {
  photos: Message[]; videos: Message[]; files: Message[]; voice: Message[]
  links: (Message & { urls: string[] })[]
}
type Tab = 'photos' | 'videos' | 'files' | 'voice' | 'links'

export function ChatProfile({ chat, onClose, onSearch }: { chat: Chat; onClose: () => void; onSearch: () => void }) {
  const { dispatch, actions } = useStore()
  const [profile, setProfile] = useState<Profile>(chat.peer)
  const [media, setMedia] = useState<Media | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({ photos: 0, videos: 0, files: 0, voice: 0, links: 0 })
  const [tab, setTab] = useState<Tab | null>(null)
  const [confirm, setConfirm] = useState<null | 'clear' | 'delete' | 'block'>(null)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('Spam')

  useEffect(() => {
    api.get<{ user: Profile }>(`/users/${chat.peer.username}`).then((r) => setProfile(r.user)).catch(() => {})
    api.get<{ media: Media; counts: Record<Tab, number> }>(`/chats/${chat.id}/media`).then((r) => {
      setMedia(r.media)
      setCounts(r.counts)
      const first = (['photos', 'videos', 'files', 'voice', 'links'] as Tab[]).find((t) => r.counts[t] > 0)
      setTab(first ?? null)
    }).catch(() => {})
  }, [chat.id, chat.peer.username])

  const guard = async (fn: () => Promise<void>) => {
    try { await fn() } catch (e) { actions.toast((e as Error).message) }
  }

  const toggleContact = () =>
    guard(async () => {
      if (profile.isContact) {
        await api.del(`/contacts/${profile.id}`)
        setProfile({ ...profile, isContact: false })
        actions.toast('Removed from contacts')
      } else {
        await api.post('/contacts', { userId: profile.id })
        setProfile({ ...profile, isContact: true })
        actions.toast('Added to contacts')
      }
    })

  const toggleBlock = () =>
    guard(async () => {
      if (profile.blockedByMe) {
        await api.del(`/blocks/${profile.id}`)
        setProfile({ ...profile, blockedByMe: false })
        actions.toast('Unblocked')
      } else {
        await api.post('/blocks', { userId: profile.id })
        setProfile({ ...profile, blockedByMe: true, isContact: false })
        actions.toast(`${profile.displayName} blocked`)
      }
      setConfirm(null)
    })

  const toggleMute = () =>
    guard(async () => {
      const { muted } = await api.post<{ muted: boolean }>(`/chats/${chat.id}/mute`, { muted: !chat.muted })
      dispatch({ type: 'CHAT_PATCH', chatId: chat.id, patch: { muted } })
      actions.toast(muted ? 'Notifications muted' : 'Notifications on')
    })

  const clearHistory = () =>
    guard(async () => {
      await api.post(`/chats/${chat.id}/clear`)
      dispatch({ type: 'MSGS_CLEAR', chatId: chat.id })
      setMedia({ photos: [], videos: [], files: [], voice: [], links: [] })
      setCounts({ photos: 0, videos: 0, files: 0, voice: 0, links: 0 })
      setConfirm(null)
      actions.toast('Chat history cleared')
    })

  const deleteChat = () =>
    guard(async () => {
      await api.del(`/chats/${chat.id}`)
      dispatch({ type: 'CHAT_REMOVE', chatId: chat.id })
      actions.toast('Chat deleted')
    })

  const shareContact = () =>
    guard(async () => {
      const text = `${profile.displayName} — @${profile.username}`
      await navigator.clipboard?.writeText(text)
      actions.toast('Contact copied to clipboard')
    })

  const report = () =>
    guard(async () => {
      await api.post('/reports', { username: profile.username, reason: reportReason })
      setReporting(false)
      actions.toast('Report sent to moderators')
    })

  const status = profile.online ? 'online' : fmtLastSeen(profile.lastSeenAt, profile.lastSeenLabel)
  const tabs = (['photos', 'videos', 'files', 'voice', 'links'] as Tab[]).filter((t) => counts[t] > 0)

  return (
    <div className="overlay profile-overlay" onClick={onClose}>
      <div className="profile-page glass-panel" onClick={(e) => e.stopPropagation()}>
        <header className="pp-head">
          <button className="icon-btn" onClick={onClose}><Icon name="back" size={22} /></button>
          <span className="pp-head-title">Profile</span>
        </header>

        <div className="pp-scroll">
          <div className="pp-hero">
            <div className="pp-hero-glow" style={{ background: `radial-gradient(circle at 50% 0%, hsl(${hueFor(profile.id)} 80% 60% / .5), transparent 70%)` }} />
            <Avatar name={profile.displayName} seed={profile.id} avatar={profile.avatar} size={112} online={profile.online} />
            <h2 className="name-row">
              <span className="name-text">{profile.displayName}</span>
              {profile.verified && <Verified size={22} />}
            </h2>
            <span className="pp-username">@{profile.username}</span>
            <span className={`pp-status${profile.online ? ' online' : ''}`}>{status}</span>
            {profile.blockedByMe && <span className="pp-blocked"><Icon name="ban" size={13} /> Blocked</span>}
          </div>

          {(profile.bio || profile.createdAt) && (
            <div className="pp-card glass">
              {profile.bio && <div className="pp-info-row"><Icon name="info" size={17} /><div><small>Bio</small><span>{profile.bio}</span></div></div>}
              {profile.createdAt && <div className="pp-info-row"><Icon name="clock" size={17} /><div><small>Joined</small><span>{fmtDate(profile.createdAt)}</span></div></div>}
            </div>
          )}

          {/* Contact management */}
          <div className="pp-actions">
            <ActionBtn icon={profile.isContact ? 'person' : 'plus'} label={profile.isContact ? 'Remove contact' : 'Add contact'} onClick={toggleContact} />
            <ActionBtn icon={chat.muted ? 'bell' : 'bellOff'} label={chat.muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />
            <ActionBtn icon="search" label="Search" onClick={() => { onClose(); onSearch() }} />
            <ActionBtn icon="forward" label="Share" onClick={shareContact} />
          </div>

          {/* Shared content */}
          <div className="pp-section-label">Shared content</div>
          {tabs.length === 0 ? (
            <div className="pp-empty-media">No shared media yet</div>
          ) : (
            <>
              <div className="pp-tabs">
                {tabs.map((t) => (
                  <button key={t} className={`pp-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                    {tabLabel(t)} <span className="pp-tab-n">{counts[t]}</span>
                  </button>
                ))}
              </div>
              <div className="pp-media">
                {tab === 'photos' && media?.photos.map((m) => (
                  <a key={m.id} className="pp-media-cell" href={m.attachment?.url} target="_blank" rel="noreferrer">
                    <img src={m.attachment?.url} alt="" loading="lazy" />
                  </a>
                ))}
                {tab === 'videos' && media?.videos.map((m) => (
                  <a key={m.id} className="pp-media-cell" href={m.attachment?.url} target="_blank" rel="noreferrer">
                    <video src={m.attachment?.url} preload="metadata" />
                    <span className="pp-play">▶</span>
                  </a>
                ))}
                {tab === 'files' && (
                  <div className="pp-list">
                    {media?.files.map((m) => (
                      <a key={m.id} className="pp-file" href={m.attachment?.url} download={m.attachment?.name ?? true}>
                        <div className="file-ic"><Icon name="file" size={20} /></div>
                        <div className="file-info"><b>{m.attachment?.name ?? 'File'}</b><span>{fmtSize(m.attachment?.size ?? 0)}</span></div>
                        <Icon name="download" size={17} />
                      </a>
                    ))}
                  </div>
                )}
                {tab === 'voice' && (
                  <div className="pp-list">
                    {media?.voice.map((m) => (
                      <div key={m.id} className="pp-voice">
                        <audio src={m.attachment?.url} controls preload="metadata" />
                        <span>{fmtDuration(m.attachment?.duration)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 'links' && (
                  <div className="pp-list">
                    {media?.links.flatMap((m) => m.urls.map((u, i) => (
                      <a key={m.id + '-' + i} className="pp-link" href={u} target="_blank" rel="noreferrer">
                        <div className="file-ic"><Icon name="globe" size={20} /></div>
                        <span>{u}</span>
                      </a>
                    )))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Danger / safety actions */}
          <div className="pp-danger">
            <button className="pp-danger-btn" onClick={() => setReporting(true)}><Icon name="flag" size={18} /> Report user</button>
            <button className="pp-danger-btn" onClick={() => profile.blockedByMe ? toggleBlock() : setConfirm('block')}>
              <Icon name="ban" size={18} /> {profile.blockedByMe ? 'Unblock user' : 'Block user'}
            </button>
            <button className="pp-danger-btn" onClick={() => setConfirm('clear')}><Icon name="trash" size={18} /> Clear history</button>
            <button className="pp-danger-btn danger" onClick={() => setConfirm('delete')}><Icon name="trash" size={18} /> Delete chat</button>
          </div>
        </div>
      </div>

      {confirm && (
        <Sheet onClose={() => setConfirm(null)} title={
          confirm === 'clear' ? 'Clear chat history?' : confirm === 'delete' ? 'Delete this chat?' : `Block ${profile.displayName}?`
        }>
          <p className="del-warn" onClick={(e) => e.stopPropagation()}>
            {confirm === 'clear' && 'All messages in this conversation will be permanently deleted for both of you. The chat stays in your list.'}
            {confirm === 'delete' && 'This conversation and all its messages will be permanently deleted for both participants.'}
            {confirm === 'block' && 'They won’t be able to message you or see your online status. This also removes them from your contacts.'}
          </p>
          <div className="sheet-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn danger-solid" onClick={confirm === 'clear' ? clearHistory : confirm === 'delete' ? deleteChat : toggleBlock}>
              {confirm === 'clear' ? 'Clear history' : confirm === 'delete' ? 'Delete chat' : 'Block'}
            </button>
            <button className="btn glass" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </Sheet>
      )}

      {reporting && (
        <Sheet onClose={() => setReporting(false)} title={`Report @${profile.username}`}>
          <div className="form-col" onClick={(e) => e.stopPropagation()}>
            <select className="select glass" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              {['Spam', 'Abuse', 'Impersonation', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </select>
            <button className="btn primary" onClick={report}>Send report</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="pp-action" onClick={onClick}>
      <div className="pp-action-ic glass"><Icon name={icon} size={21} /></div>
      <span>{label}</span>
    </button>
  )
}

function tabLabel(t: Tab) {
  return { photos: 'Photos', videos: 'Videos', files: 'Files', voice: 'Voice', links: 'Links' }[t]
}
function hueFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}
