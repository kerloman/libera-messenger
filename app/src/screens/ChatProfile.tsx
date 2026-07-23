import { useEffect, useState } from 'react'
import { fmtDate, fmtDuration, fmtLastSeen, fmtSize, hueOf } from '../data'
import type { Chat, Message, Profile } from '../data'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
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

// --- dynamic profile background: extract two dominant hues from the avatar ---
// Draws the avatar onto a small canvas, builds a saturation-weighted hue
// histogram, and returns the two strongest distinct hues. Brightness and
// saturation are normalized later per theme so text contrast is preserved.
const paletteCache = new Map<string, [number, number] | null>()

async function extractHues(url: string): Promise<[number, number] | null> {
  if (paletteCache.has(url)) return paletteCache.get(url)!
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    const bins = new Array(12).fill(0)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const l = (max + min) / 2
      const d = max - min
      if (d < 0.04 || l < 0.08 || l > 0.95) continue // skip grey/near-black/near-white
      const s = d / (1 - Math.abs(2 * l - 1))
      let h = 0
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h = Math.round(((h * 60 + 360) % 360) / 30) % 12
      bins[h] += s // saturation-weighted
    }
    const ranked = bins.map((w, i) => ({ w, h: i * 30 })).sort((a, b) => b.w - a.w)
    if (ranked[0].w === 0) {
      paletteCache.set(url, null)
      return null
    }
    const h1 = ranked[0].h
    const second = ranked.find((x) => x.w > 0 && Math.min(Math.abs(x.h - h1), 360 - Math.abs(x.h - h1)) >= 60)
    const out: [number, number] = [h1, second ? second.h : (h1 + 40) % 360]
    paletteCache.set(url, out)
    return out
  } catch {
    paletteCache.set(url, null)
    return null
  }
}

export function ChatProfile({ chat, onClose, onSearch }: { chat: Chat; onClose: () => void; onSearch: () => void }) {
  const { dispatch, actions } = useStore()
  const [profile, setProfile] = useState<Profile>(chat.peer)
  const [media, setMedia] = useState<Media | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({ photos: 0, videos: 0, files: 0, voice: 0, links: 0 })
  const [tab, setTab] = useState<Tab | null>(null)
  const [confirm, setConfirm] = useState<null | 'clear' | 'delete' | 'block'>(null)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('Spam')
  // hues driving the adaptive header: avatar-derived, falling back to the id hue
  const [hues, setHues] = useState<[number, number]>([hueOf(chat.peer.id), (hueOf(chat.peer.id) + 42) % 360])

  useEffect(() => {
    api.get<{ user: Profile }>(`/users/${chat.peer.username}`).then((r) => setProfile(r.user)).catch(() => {})
    api.get<{ media: Media; counts: Record<Tab, number> }>(`/chats/${chat.id}/media`).then((r) => {
      setMedia(r.media)
      setCounts(r.counts)
      const first = (['photos', 'videos', 'files', 'voice', 'links'] as Tab[]).find((tb) => r.counts[tb] > 0)
      setTab(first ?? null)
    }).catch(() => {})
  }, [chat.id, chat.peer.username])

  // recompute the adaptive background whenever the (possibly updated) avatar changes
  useEffect(() => {
    let alive = true
    if (profile.avatar) {
      extractHues(profile.avatar).then((h) => {
        if (alive && h) setHues(h)
      })
    }
    return () => { alive = false }
  }, [profile.avatar])

  const guard = async (fn: () => Promise<void>) => {
    try { await fn() } catch (e) { actions.toast((e as Error).message) }
  }

  const toggleContact = () =>
    guard(async () => {
      if (profile.isContact) {
        await api.del(`/contacts/${profile.id}`)
        setProfile({ ...profile, isContact: false })
        actions.toast(t('removedFromContacts'))
      } else {
        await api.post('/contacts', { userId: profile.id })
        setProfile({ ...profile, isContact: true })
        actions.toast(t('addedToContacts'))
      }
    })

  const toggleBlock = () =>
    guard(async () => {
      if (profile.blockedByMe) {
        await api.del(`/blocks/${profile.id}`)
        setProfile({ ...profile, blockedByMe: false })
        actions.toast(t('unblocked'))
      } else {
        await api.post('/blocks', { userId: profile.id })
        setProfile({ ...profile, blockedByMe: true, isContact: false })
        actions.toast(`${profile.displayName} ${t('blockedToast')}`)
      }
      setConfirm(null)
    })

  const toggleMute = () =>
    guard(async () => {
      const { muted } = await api.post<{ muted: boolean }>(`/chats/${chat.id}/mute`, { muted: !chat.muted })
      dispatch({ type: 'CHAT_PATCH', chatId: chat.id, patch: { muted } })
      actions.toast(muted ? t('notificationsMuted') : t('notificationsOn'))
    })

  const clearHistory = () =>
    guard(async () => {
      await api.post(`/chats/${chat.id}/clear`)
      dispatch({ type: 'MSGS_CLEAR', chatId: chat.id })
      setMedia({ photos: [], videos: [], files: [], voice: [], links: [] })
      setCounts({ photos: 0, videos: 0, files: 0, voice: 0, links: 0 })
      setConfirm(null)
      actions.toast(t('historyCleared'))
    })

  const deleteChat = () =>
    guard(async () => {
      await api.del(`/chats/${chat.id}`)
      dispatch({ type: 'CHAT_REMOVE', chatId: chat.id })
      actions.toast(t('chatDeleted'))
    })

  const shareContact = () =>
    guard(async () => {
      const text = `${profile.displayName} — @${profile.username}`
      await navigator.clipboard?.writeText(text)
      actions.toast(t('contactCopied'))
    })

  const report = () =>
    guard(async () => {
      await api.post('/reports', { username: profile.username, reason: reportReason })
      setReporting(false)
      actions.toast(t('reportSent'))
    })

  const status = profile.online ? t('online') : fmtLastSeen(profile.lastSeenAt, profile.lastSeenLabel)
  const tabs = (['photos', 'videos', 'files', 'voice', 'links'] as Tab[]).filter((tb) => counts[tb] > 0)
  const reasons = [
    { value: 'Spam', label: t('reasonSpam') },
    { value: 'Abuse', label: t('reasonAbuse') },
    { value: 'Impersonation', label: t('reasonImpersonation') },
    { value: 'Other', label: t('reasonOther') },
  ]

  return (
    <div className="overlay profile-overlay" onClick={onClose}>
      <div className="profile-page glass-panel" onClick={(e) => e.stopPropagation()}>
        <header className="pp-head">
          <button className="icon-btn" onClick={onClose}><Icon name="back" size={22} /></button>
          <span className="pp-head-title">{t('profile')}</span>
        </header>

        <div className="pp-scroll">
          <div className="pp-hero">
            <div
              className="pp-hero-glow"
              style={{
                background: `
                  radial-gradient(120% 90% at 30% 0%, hsl(${hues[0]} var(--hero-sat) var(--hero-l1) / var(--hero-a1)), transparent 60%),
                  radial-gradient(120% 90% at 75% 10%, hsl(${hues[1]} var(--hero-sat) var(--hero-l2) / var(--hero-a2)), transparent 65%)`,
              }}
            />
            <Avatar name={profile.displayName} seed={profile.id} avatar={profile.avatar} size={112} online={profile.online} />
            <h2 className="name-row">
              <span className="name-text">{profile.displayName}</span>
              {profile.verified && <Verified size={22} />}
            </h2>
            <span className="pp-username">@{profile.username}</span>
            <span className={`pp-status${profile.online ? ' online' : ''}`}>{status}</span>
            {profile.blockedByMe && <span className="pp-blocked"><Icon name="ban" size={13} /> {t('blocked')}</span>}
          </div>

          {(profile.bio || profile.createdAt) && (
            <div className="pp-card glass">
              {profile.bio && <div className="pp-info-row"><Icon name="info" size={17} /><div><small>{t('bio')}</small><span>{profile.bio}</span></div></div>}
              {profile.createdAt && <div className="pp-info-row"><Icon name="clock" size={17} /><div><small>{t('joined')}</small><span>{fmtDate(profile.createdAt)}</span></div></div>}
            </div>
          )}

          {/* Contact management */}
          <div className="pp-actions">
            <ActionBtn icon={profile.isContact ? 'person' : 'plus'} label={profile.isContact ? t('removeContact') : t('addContact')} onClick={toggleContact} />
            <ActionBtn icon={chat.muted ? 'bell' : 'bellOff'} label={chat.muted ? t('unmute') : t('mute')} onClick={toggleMute} />
            <ActionBtn icon="search" label={t('search')} onClick={() => { onClose(); onSearch() }} />
            <ActionBtn icon="forward" label={t('share')} onClick={shareContact} />
          </div>

          {/* Shared content */}
          <div className="pp-section-label">{t('sharedContent')}</div>
          {tabs.length === 0 ? (
            <div className="pp-empty-media">{t('noSharedMedia')}</div>
          ) : (
            <>
              <div className="pp-tabs">
                {tabs.map((tb) => (
                  <button key={tb} className={`pp-tab${tab === tb ? ' on' : ''}`} onClick={() => setTab(tb)}>
                    {tabLabel(tb)} <span className="pp-tab-n">{counts[tb]}</span>
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
                        <div className="file-info"><b>{m.attachment?.name ?? t('filePreview')}</b><span>{fmtSize(m.attachment?.size ?? 0)}</span></div>
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
            <button className="pp-danger-btn" onClick={() => setReporting(true)}><Icon name="flag" size={18} /> {t('reportUser')}</button>
            <button className="pp-danger-btn" onClick={() => profile.blockedByMe ? toggleBlock() : setConfirm('block')}>
              <Icon name="ban" size={18} /> {profile.blockedByMe ? t('unblockUser') : t('blockUser')}
            </button>
            <button className="pp-danger-btn" onClick={() => setConfirm('clear')}><Icon name="trash" size={18} /> {t('clearHistory')}</button>
            <button className="pp-danger-btn danger" onClick={() => setConfirm('delete')}><Icon name="trash" size={18} /> {t('deleteChat')}</button>
          </div>
        </div>
      </div>

      {confirm && (
        <Sheet onClose={() => setConfirm(null)} title={
          confirm === 'clear' ? t('clearHistoryQ') : confirm === 'delete' ? t('deleteChatQ') : `${t('blockQ')} ${profile.displayName}?`
        }>
          <p className="del-warn" onClick={(e) => e.stopPropagation()}>
            {confirm === 'clear' && t('clearHistoryWarn')}
            {confirm === 'delete' && t('deleteChatWarn')}
            {confirm === 'block' && t('blockWarn')}
          </p>
          <div className="sheet-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn danger-solid" onClick={confirm === 'clear' ? clearHistory : confirm === 'delete' ? deleteChat : toggleBlock}>
              {confirm === 'clear' ? t('clearHistory') : confirm === 'delete' ? t('deleteChat') : t('block')}
            </button>
            <button className="btn glass" onClick={() => setConfirm(null)}>{t('cancel')}</button>
          </div>
        </Sheet>
      )}

      {reporting && (
        <Sheet onClose={() => setReporting(false)} title={`${t('report')} @${profile.username}`}>
          <div className="form-col" onClick={(e) => e.stopPropagation()}>
            <select className="select glass" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              {reasons.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <button className="btn primary" onClick={report}>{t('sendReport')}</button>
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

function tabLabel(tb: Tab) {
  return { photos: t('photos'), videos: t('videos'), files: t('files'), voice: t('voice'), links: t('links') }[tb]
}
