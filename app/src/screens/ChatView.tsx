import { useEffect, useRef, useState } from 'react'
import { fmtDuration, fmtLastSeen, fmtSize, fmtTime } from '../data'
import type { Message } from '../data'
import { api } from '../lib/api'
import { getSocket } from '../lib/socket'
import { startCall } from '../lib/calls'
import { tickFor, useStore } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

const quickReactions = ['❤️', '👍', '🔥', '😂', '😮', '🙏']

export function ChatView({ wide }: { wide?: boolean }) {
  const { state, dispatch, actions } = useStore()
  const chat = state.chats.find((c) => c.id === state.activeChat)
  const msgs = state.messages[state.activeChat ?? ''] ?? []

  const [text, setText] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [forwarding, setForwarding] = useState<number | null>(null)
  const [attach, setAttach] = useState(false)
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null)
  const [canLoadEarlier, setCanLoadEarlier] = useState(msgs.length >= 50)
  const [sending, setSending] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const typingUntil = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const recChunks = useRef<Blob[]>([])
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, chat?.typing])

  useEffect(() => setCanLoadEarlier(msgs.length >= 50), [msgs.length >= 50]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!chat) return null

  const emitTyping = () => {
    const now = Date.now()
    if (now > typingUntil.current) {
      getSocket()?.emit('typing', { chatId: chat.id, on: true })
      typingUntil.current = now + 2000
    }
  }

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      actions.toast((e as Error).message)
    }
  }

  const doSend = () =>
    guard(async () => {
      const t = text.trim()
      if (!t || sending) return
      setSending(true)
      try {
        if (editing) {
          const { message } = await api.patch<{ message: Message }>(`/messages/${editing}`, { body: t })
          dispatch({ type: 'MSG_UPDATE', message })
          setEditing(null)
        } else {
          await actions.sendText(chat.id, t, replyTo ?? undefined)
          setReplyTo(null)
        }
        setText('')
      } finally {
        setSending(false)
      }
    })

  const sendPicked = (accept: 'image' | 'any') => {
    setAttach(false)
    ;(accept === 'image' ? imageInput : fileInput).current?.click()
  }

  const onFile = (f: File | undefined) =>
    f && guard(() => actions.sendFile(chat.id, f))

  const sendLocation = () => {
    setAttach(false)
    if (!navigator.geolocation) return actions.toast('Location is not available in this browser')
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        guard(() =>
          actions.sendText(
            chat.id,
            `📍 My location: https://www.openstreetmap.org/?mlat=${pos.coords.latitude.toFixed(5)}&mlon=${pos.coords.longitude.toFixed(5)}#map=16/${pos.coords.latitude.toFixed(5)}/${pos.coords.longitude.toFixed(5)}`,
          ),
        ),
      () => actions.toast('Location permission was denied'),
    )
  }

  const startRecording = () =>
    guard(async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        return actions.toast('Microphone access was denied')
      }
      recChunks.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => e.data.size && recChunks.current.push(e.data)
      rec.start()
      recorder.current = rec
      setRecording({ startedAt: Date.now() })
    })

  const stopRecording = (send: boolean) => {
    const rec = recorder.current
    if (!rec) return
    const startedAt = recording?.startedAt ?? Date.now()
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop())
      if (send && recChunks.current.length) {
        const blob = new Blob(recChunks.current, { type: rec.mimeType || 'audio/webm' })
        const duration = (Date.now() - startedAt) / 1000
        guard(() => actions.sendFile(chat.id, blob, { kind: 'voice', duration, name: 'voice-message.webm' }))
      }
    }
    rec.stop()
    recorder.current = null
    setRecording(null)
  }

  const selMsg = selected !== null ? msgs.find((m) => m.id === selected) : null
  const status = chat.typing
    ? 'typing…'
    : chat.peer.online
      ? 'online'
      : fmtLastSeen(chat.peer.lastSeenAt)

  return (
    <div className={`chatview wp-${state.prefs.wallpaper}`}>
      <header className="chat-head glass">
        {!wide && (
          <button className="icon-btn" onClick={() => dispatch({ type: 'OPEN_CHAT', id: null })}>
            <Icon name="back" size={22} />
          </button>
        )}
        <Avatar name={chat.peer.displayName} seed={chat.peer.id} avatar={chat.peer.avatar} size={40} online={chat.peer.online} />
        <div className="chat-title">
          <span className="chat-name">{chat.peer.displayName}</span>
          <span className={`chat-status${chat.typing ? ' typing' : ''}${chat.peer.online && !chat.typing ? ' online' : ''}`}>
            {status}
          </span>
        </div>
        <div className="head-actions">
          <button className="icon-btn" title="Voice call" onClick={() => startCall(chat.id, chat.peer, false)}>
            <Icon name="phone" size={21} />
          </button>
          <button className="icon-btn" title="Video call" onClick={() => startCall(chat.id, chat.peer, true)}>
            <Icon name="video" size={22} />
          </button>
        </div>
      </header>

      <div className="msgs">
        {canLoadEarlier && (
          <button
            className="chip glass load-earlier"
            onClick={() => guard(async () => setCanLoadEarlier(await actions.loadEarlier(chat.id)))}
          >
            Load earlier messages
          </button>
        )}
        {msgs.length === 0 && (
          <div className="e2e-note">
            <Icon name="lock" size={12} /> This is the beginning of your conversation with {chat.peer.displayName}.
          </div>
        )}
        {msgs.map((m, i) => (
          <Bubble
            key={m.id}
            m={m}
            all={msgs}
            first={i === 0 || msgs[i - 1].senderId !== m.senderId}
            tick={m.senderId === state.me?.id ? tickFor(chat, m) : null}
            onSelect={() => !m.deleted && setSelected(m.id)}
          />
        ))}
        {chat.typing && (
          <div className="msg in">
            <div className="bubble typing-bubble"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer-zone">
        {(replyTo ?? editing) !== null && (
          <div className="compose-context glass">
            <Icon name={editing ? 'pencil' : 'reply'} size={16} />
            <div className="cc-text">
              <b>{editing ? 'Edit message' : 'Reply'}</b>
              <span>{msgs.find((m) => m.id === (editing ?? replyTo))?.body ?? 'Attachment'}</span>
            </div>
            <button className="icon-btn" onClick={() => { setReplyTo(null); setEditing(null); setText('') }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        {recording ? (
          <div className="composer glass recording">
            <span className="rec-dot" />
            <RecTimer startedAt={recording.startedAt} />
            <span className="rec-hint">Recording voice message…</span>
            <button className="icon-btn" title="Cancel" onClick={() => stopRecording(false)}>
              <Icon name="trash" size={20} />
            </button>
            <button className="send-btn" title="Send" onClick={() => stopRecording(true)}>
              <Icon name="send" size={19} stroke={2.2} />
            </button>
          </div>
        ) : (
          <div className="composer glass">
            <button className="icon-btn" onClick={() => setAttach(true)}><Icon name="plus" size={22} /></button>
            <input
              placeholder="Message"
              value={text}
              onChange={(e) => { setText(e.target.value); emitTyping() }}
              onKeyDown={(e) => e.key === 'Enter' && doSend()}
            />
            {text.trim() ? (
              <button className="send-btn" onClick={doSend} disabled={sending}>
                <Icon name="send" size={19} stroke={2.2} />
              </button>
            ) : (
              <button className="icon-btn mic" title="Record voice message" onClick={startRecording}>
                <Icon name="mic" size={21} />
              </button>
            )}
          </div>
        )}
      </div>

      <input ref={imageInput} type="file" accept="image/*,video/*" hidden
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={fileInput} type="file" hidden
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />

      {selMsg && (
        <Sheet onClose={() => setSelected(null)}>
          <div className="react-row">
            {quickReactions.map((e) => (
              <button
                key={e}
                className={`react-btn${selMsg.reactions.some((r) => r.emoji === e && r.userIds.includes(state.me!.id)) ? ' mine' : ''}`}
                onClick={() =>
                  guard(async () => {
                    const { reactions } = await api.post<{ reactions: Message['reactions'] }>(
                      `/messages/${selMsg.id}/reactions`, { emoji: e })
                    dispatch({ type: 'REACTIONS', chatId: chat.id, messageId: selMsg.id, reactions })
                    setSelected(null)
                  })
                }
              >
                {e}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="sheet-btn" onClick={() => { setReplyTo(selMsg.id); setEditing(null); setSelected(null) }}>
              <Icon name="reply" size={20} /> Reply
            </button>
            {selMsg.body && (
              <button className="sheet-btn" onClick={() => { navigator.clipboard?.writeText(selMsg.body!); setSelected(null); actions.toast('Copied') }}>
                <Icon name="file" size={19} /> Copy text
              </button>
            )}
            {selMsg.senderId === state.me?.id && selMsg.kind === 'text' && (
              <button className="sheet-btn" onClick={() => { setEditing(selMsg.id); setReplyTo(null); setText(selMsg.body ?? ''); setSelected(null) }}>
                <Icon name="pencil" size={19} /> Edit
              </button>
            )}
            <button className="sheet-btn" onClick={() => { setForwarding(selMsg.id); setSelected(null) }}>
              <Icon name="forward" size={20} /> Forward
            </button>
            {selMsg.senderId === state.me?.id && (
              <button
                className="sheet-btn danger"
                onClick={() =>
                  guard(async () => {
                    await api.del(`/messages/${selMsg.id}`)
                    dispatch({ type: 'MSG_DELETE', chatId: chat.id, messageId: selMsg.id })
                    setSelected(null)
                  })
                }
              >
                <Icon name="trash" size={20} /> Delete
              </button>
            )}
          </div>
        </Sheet>
      )}

      {attach && (
        <Sheet onClose={() => setAttach(false)} title="Share">
          <div className="attach-grid">
            <button className="attach-opt" onClick={() => sendPicked('image')}>
              <div className="attach-ic glass"><Icon name="photo" size={24} /></div>
              <span>Photo / Video</span>
            </button>
            <button className="attach-opt" onClick={() => sendPicked('any')}>
              <div className="attach-ic glass"><Icon name="file" size={24} /></div>
              <span>File</span>
            </button>
            <button className="attach-opt" onClick={sendLocation}>
              <div className="attach-ic glass"><Icon name="mappin" size={24} /></div>
              <span>Location</span>
            </button>
            <button className="attach-opt" onClick={() => { setAttach(false); startRecording() }}>
              <div className="attach-ic glass"><Icon name="mic" size={24} /></div>
              <span>Voice</span>
            </button>
          </div>
        </Sheet>
      )}

      {forwarding !== null && (
        <Sheet onClose={() => setForwarding(null)} title="Forward to…">
          <div className="sheet-list">
            {state.chats.filter((c) => c.id !== chat.id).map((c) => (
              <button
                key={c.id}
                className="row"
                onClick={() =>
                  guard(async () => {
                    const { message } = await api.post<{ message: Message }>(`/messages/${forwarding}/forward`, { chatId: c.id })
                    dispatch({ type: 'MSG_ADD', message })
                    setForwarding(null)
                    actions.toast(`Forwarded to ${c.peer.displayName}`)
                  })
                }
              >
                <Avatar name={c.peer.displayName} seed={c.peer.id} avatar={c.peer.avatar} size={42} />
                <div className="row-main"><span className="row-name">{c.peer.displayName}</span></div>
              </button>
            ))}
            {state.chats.length <= 1 && <div className="list-hint">No other conversations yet.</div>}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function RecTimer({ startedAt }: { startedAt: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [])
  return <span className="rec-time">{fmtDuration((Date.now() - startedAt) / 1000)}</span>
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>{p}</a>
    ) : (
      p
    ),
  )
}

function Bubble({
  m, all, first, tick, onSelect,
}: {
  m: Message
  all: Message[]
  first: boolean
  tick: 'sent' | 'delivered' | 'read' | null
  onSelect: () => void
}) {
  const { state } = useStore()
  const mine = m.senderId === state.me?.id
  const quoted = m.replyTo ? all.find((x) => x.id === m.replyTo) : undefined

  if (m.deleted) {
    return (
      <div className={`msg ${mine ? 'out' : 'in'}${first ? ' first' : ''}`}>
        <div className={`bubble ${mine ? 'out' : 'in'} deleted`}>
          <span className="body"><Icon name="ban" size={13} /> Message deleted</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`msg ${mine ? 'out' : 'in'}${first ? ' first' : ''}`}>
      <div className={`bubble ${mine ? 'out' : 'in'} t-${m.kind}`} onClick={onSelect}>
        {quoted && (
          <div className="quote">
            <b>{quoted.senderId === state.me?.id ? 'You' : ''}</b>
            <span>{quoted.deleted ? 'Deleted message' : quoted.body ?? 'Attachment'}</span>
          </div>
        )}

        {m.kind === 'image' && m.attachment && (
          <img className="media-img" src={m.attachment.url} alt={m.body ?? 'photo'} loading="lazy" />
        )}
        {m.kind === 'video' && m.attachment && (
          <video className="media-img" src={m.attachment.url} controls preload="metadata" onClick={(e) => e.stopPropagation()} />
        )}
        {m.kind === 'voice' && m.attachment && (
          <div className="voice" onClick={(e) => e.stopPropagation()}>
            <audio src={m.attachment.url} controls preload="metadata" />
            <span className="dur">{fmtDuration(m.attachment.duration)}</span>
          </div>
        )}
        {m.kind === 'file' && m.attachment && (
          <a className="file-msg" href={m.attachment.url} download={m.attachment.name ?? true} onClick={(e) => e.stopPropagation()}>
            <div className="file-ic"><Icon name="file" size={22} /></div>
            <div className="file-info">
              <b>{m.attachment.name ?? 'File'}</b>
              <span>{fmtSize(m.attachment.size)}</span>
            </div>
            <Icon name="download" size={18} className="dl" />
          </a>
        )}

        {m.body && <span className={m.kind === 'text' ? 'body' : 'caption'}>{linkify(m.body)}</span>}

        <span className="meta">
          {m.edited && <i>edited</i>}
          {fmtTime(m.createdAt)}
          {tick && (
            <Icon name={tick === 'sent' ? 'check' : 'checks'} size={14}
                  className={`tick${tick === 'read' ? ' read' : ''}`} />
          )}
        </span>
      </div>
      {m.reactions.length > 0 && (
        <div className={`reactions ${mine ? 'out' : 'in'}`}>
          {m.reactions.map((r) => (
            <span key={r.emoji} className={`reaction glass${r.userIds.includes(state.me!.id) ? ' mine' : ''}`}>
              {r.emoji} {r.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
