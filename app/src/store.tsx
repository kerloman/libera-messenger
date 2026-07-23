import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { accents } from './data'
import type { Chat, Me, Message } from './data'
import { api } from './lib/api'
import { connectSocket, disconnectSocket, getSocket } from './lib/socket'
import { initCallEngine } from './lib/calls'
import type { CallUI } from './lib/calls'
import { configureSound, defaultSoundSettings, play as playSound } from './lib/sound'
import type { SoundSettings } from './lib/sound'
import { resolveLang, setLang, t } from './lib/i18n'
import type { LangPref } from './lib/i18n'

export type Tab = 'chats' | 'calls' | 'settings'

export type Prefs = {
  theme: 'auto' | 'light' | 'dark'
  accent: keyof typeof accents
  fontScale: number
  wallpaper: string
  notifications: boolean
  language: LangPref
  sound: SoundSettings
}

type State = {
  boot: boolean
  me: Me | null
  chats: Chat[]
  messages: Record<string, Message[] | undefined>
  activeChat: string | null
  tab: Tab
  admin: boolean
  call: CallUI | null
  callTick: number
  prefs: Prefs
  toast: string | null
}

const defaultPrefs: Prefs = {
  theme: 'auto',
  accent: 'aurora',
  fontScale: 1,
  wallpaper: 'aurora',
  notifications: true,
  language: 'auto',
  sound: defaultSoundSettings,
}

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem('libera-prefs') ?? '{}')
    return { ...defaultPrefs, ...saved, sound: { ...defaultSoundSettings, ...saved.sound, categories: { ...defaultSoundSettings.categories, ...saved.sound?.categories } } }
  } catch {
    return defaultPrefs
  }
}

type Action =
  | { type: 'BOOT_DONE'; me: Me | null }
  | { type: 'SET_ME'; me: Me | null }
  | { type: 'TAB'; tab: Tab }
  | { type: 'OPEN_CHAT'; id: string | null }
  | { type: 'CHATS_SET'; chats: Chat[] }
  | { type: 'CHAT_UPSERT'; chat: Chat }
  | { type: 'CHAT_PATCH'; chatId: string; patch: Partial<Chat> }
  | { type: 'CHAT_REMOVE'; chatId: string }
  | { type: 'MSGS_CLEAR'; chatId: string }
  | { type: 'MSGS_SET'; chatId: string; messages: Message[]; prepend?: boolean }
  | { type: 'MSG_ADD'; message: Message }
  | { type: 'MSG_UPDATE'; message: Message }
  | { type: 'MSG_DELETE'; chatId: string; messageId: number }
  | { type: 'REACTIONS'; chatId: string; messageId: number; reactions: Message['reactions'] }
  | { type: 'RECEIPT'; chatId: string; deliveredUpTo: number | null; readUpTo: number | null }
  | { type: 'PRESENCE'; userId: string; online: boolean; lastSeen: string | null; lastSeenLabel?: string | null }
  | { type: 'PRIVACY'; privacy: Me['privacy'] }
  | { type: 'TYPING'; chatId: string; on: boolean }
  | { type: 'ADMIN'; on: boolean }
  | { type: 'CALL'; call: CallUI | null }
  | { type: 'CALL_TICK' }
  | { type: 'PREF'; key: keyof Prefs; value: Prefs[keyof Prefs] }
  | { type: 'TOAST'; msg: string | null }

const initial: State = {
  boot: false,
  me: null,
  chats: [],
  messages: {},
  activeChat: null,
  tab: 'chats',
  admin: false,
  call: null,
  callTick: 0,
  prefs: loadPrefs(),
  toast: null,
}

function patchChat(chats: Chat[], chatId: string, patch: Partial<Chat> | ((c: Chat) => Partial<Chat>)) {
  return chats.map((c) => (c.id === chatId ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c))
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'BOOT_DONE':
      return { ...state, boot: true, me: a.me }
    case 'SET_ME':
      return a.me
        ? { ...state, me: a.me }
        : { ...initial, boot: true, prefs: state.prefs, me: null }
    case 'TAB':
      return { ...state, tab: a.tab, activeChat: null }
    case 'OPEN_CHAT':
      return {
        ...state,
        activeChat: a.id,
        chats: a.id ? patchChat(state.chats, a.id, { unread: 0 }) : state.chats,
      }
    case 'CHATS_SET':
      return { ...state, chats: a.chats }
    case 'CHAT_UPSERT': {
      const exists = state.chats.some((c) => c.id === a.chat.id)
      return { ...state, chats: exists ? patchChat(state.chats, a.chat.id, a.chat) : [a.chat, ...state.chats] }
    }
    case 'CHAT_PATCH':
      return { ...state, chats: patchChat(state.chats, a.chatId, a.patch) }
    case 'CHAT_REMOVE': {
      const messages = { ...state.messages }
      delete messages[a.chatId]
      return {
        ...state,
        chats: state.chats.filter((c) => c.id !== a.chatId),
        messages,
        activeChat: state.activeChat === a.chatId ? null : state.activeChat,
      }
    }
    case 'MSGS_CLEAR':
      return {
        ...state,
        messages: { ...state.messages, [a.chatId]: [] },
        chats: patchChat(state.chats, a.chatId, { lastMessage: null, unread: 0 }),
      }
    case 'MSGS_SET': {
      const cur = state.messages[a.chatId] ?? []
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: a.prepend ? [...a.messages, ...cur] : a.messages,
        },
      }
    }
    case 'MSG_ADD': {
      const list = state.messages[a.message.chatId]
      const messages = list && !list.some((m) => m.id === a.message.id)
        ? { ...state.messages, [a.message.chatId]: [...list, a.message] }
        : state.messages
      const active = state.activeChat === a.message.chatId
      const chats = patchChat(state.chats, a.message.chatId, (c) => ({
        lastMessage: a.message,
        unread: a.message.senderId === state.me?.id || active ? c.unread : c.unread + 1,
      }))
      return { ...state, messages, chats }
    }
    case 'MSG_UPDATE': {
      const list = state.messages[a.message.chatId]
      return {
        ...state,
        messages: list
          ? { ...state.messages, [a.message.chatId]: list.map((m) => (m.id === a.message.id ? a.message : m)) }
          : state.messages,
        chats: patchChat(state.chats, a.message.chatId, (c) => ({
          lastMessage: c.lastMessage?.id === a.message.id ? a.message : c.lastMessage,
        })),
      }
    }
    case 'MSG_DELETE': {
      const list = state.messages[a.chatId]
      const mark = (m: Message) =>
        m.id === a.messageId ? { ...m, deleted: true, body: null, attachment: null, reactions: [] } : m
      return {
        ...state,
        messages: list ? { ...state.messages, [a.chatId]: list.map(mark) } : state.messages,
        chats: patchChat(state.chats, a.chatId, (c) => ({
          lastMessage: c.lastMessage ? mark(c.lastMessage) : c.lastMessage,
        })),
      }
    }
    case 'REACTIONS': {
      const list = state.messages[a.chatId]
      return {
        ...state,
        messages: list
          ? {
              ...state.messages,
              [a.chatId]: list.map((m) => (m.id === a.messageId ? { ...m, reactions: a.reactions } : m)),
            }
          : state.messages,
      }
    }
    case 'RECEIPT':
      return {
        ...state,
        chats: patchChat(state.chats, a.chatId, (c) => ({
          peerDeliveredUpTo: Math.max(c.peerDeliveredUpTo, a.deliveredUpTo ?? 0),
          peerReadUpTo: Math.max(c.peerReadUpTo, a.readUpTo ?? 0),
        })),
      }
    case 'PRESENCE':
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.peer.id === a.userId
            ? { ...c, peer: { ...c.peer, online: a.online, lastSeenAt: a.lastSeen, lastSeenLabel: a.lastSeenLabel ?? null } }
            : c,
        ),
      }
    case 'PRIVACY':
      return state.me ? { ...state, me: { ...state.me, privacy: a.privacy } } : state
    case 'TYPING':
      return { ...state, chats: patchChat(state.chats, a.chatId, { typing: a.on }) }
    case 'ADMIN':
      return { ...state, admin: a.on }
    case 'CALL':
      return { ...state, call: a.call }
    case 'CALL_TICK':
      return { ...state, callTick: state.callTick + 1 }
    case 'PREF': {
      const prefs = { ...state.prefs, [a.key]: a.value }
      localStorage.setItem('libera-prefs', JSON.stringify(prefs))
      return { ...state, prefs }
    }
    case 'TOAST':
      return { ...state, toast: a.msg }
    default:
      return state
  }
}

type Store = {
  state: State
  dispatch: (a: Action) => void
  actions: {
    afterLogin: (me: Me) => Promise<void>
    logout: () => Promise<void>
    refreshChats: () => Promise<void>
    openChat: (id: string) => Promise<void>
    loadEarlier: (chatId: string) => Promise<boolean>
    sendText: (chatId: string, body: string, replyTo?: number) => Promise<void>
    sendFile: (chatId: string, file: File | Blob, opts?: { kind?: string; body?: string; duration?: number; name?: string }) => Promise<void>
    toast: (msg: string) => void
  }
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state
  const typingTimers = useRef<Record<string, number>>({})
  const toastTimer = useRef<number>(0)

  const actions = useMemo<Store['actions']>(() => {
    const toast = (msg: string) => {
      dispatch({ type: 'TOAST', msg })
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => dispatch({ type: 'TOAST', msg: null }), 2600)
    }

    const refreshChats = async () => {
      const { chats } = await api.get<{ chats: Chat[] }>('/chats')
      dispatch({ type: 'CHATS_SET', chats })
    }

    const markRead = (chatId: string) => {
      const chat = stateRef.current.chats.find((c) => c.id === chatId)
      const last = chat?.lastMessage
      if (last && last.senderId !== stateRef.current.me?.id)
        api.post(`/chats/${chatId}/read`, { messageId: last.id }).catch(() => {})
    }

    const setupSocket = () => {
      const s = connectSocket()
      s.off() // avoid duplicate handlers on re-login
      s.on('msg:new', ({ chatId, message }: { chatId: string; message: Message }) => {
        const known = stateRef.current.chats.some((c) => c.id === chatId)
        dispatch({ type: 'MSG_ADD', message })
        if (!known) refreshChats().catch(() => {})
        const st = stateRef.current
        const chat = st.chats.find((c) => c.id === chatId)
        if (!chat?.muted)
          playSound(
            message.kind === 'image' || message.kind === 'video' ? 'photoReceived'
              : message.kind === 'file' ? 'fileReceived'
              : message.kind === 'voice' ? 'voiceReceived'
              : 'messageReceived',
          )
        if (st.activeChat === chatId && document.visibilityState === 'visible') {
          api.post(`/chats/${chatId}/read`, { messageId: message.id }).catch(() => {})
          dispatch({ type: 'CHAT_PATCH', chatId, patch: { unread: 0 } })
        } else if (st.prefs.notifications && Notification?.permission === 'granted') {
          if (!chat?.muted)
            new Notification(chat?.peer.displayName ?? t('newMessage'), {
              body: message.body ?? t('attachment'),
              icon: '/favicon.svg',
            })
        }
        dispatch({ type: 'TYPING', chatId, on: false })
      })
      s.on('msg:edit', ({ message }: { message: Message }) => dispatch({ type: 'MSG_UPDATE', message }))
      s.on('msg:delete', ({ chatId, messageId }) => dispatch({ type: 'MSG_DELETE', chatId, messageId }))
      s.on('msg:react', ({ chatId, messageId, reactions }) =>
        dispatch({ type: 'REACTIONS', chatId, messageId, reactions }))
      s.on('receipt', ({ chatId, deliveredUpTo, readUpTo }) =>
        dispatch({ type: 'RECEIPT', chatId, deliveredUpTo, readUpTo }))
      s.on('presence', ({ userId, online, lastSeen, lastSeenLabel }) =>
        dispatch({ type: 'PRESENCE', userId, online, lastSeen, lastSeenLabel }))
      s.on('me:privacy', ({ privacy }) => dispatch({ type: 'PRIVACY', privacy }))
      s.on('me:language', ({ language }: { language: string | null }) => {
        const me = stateRef.current.me
        if (me) dispatch({ type: 'SET_ME', me: { ...me, language } })
      })
      s.on('typing', ({ chatId, on }) => {
        dispatch({ type: 'TYPING', chatId, on })
        window.clearTimeout(typingTimers.current[chatId])
        if (on)
          typingTimers.current[chatId] = window.setTimeout(
            () => dispatch({ type: 'TYPING', chatId, on: false }),
            4000,
          )
      })
      s.on('chat:new', ({ chat }: { chat: Chat }) => dispatch({ type: 'CHAT_UPSERT', chat }))
      s.on('chat:cleared', ({ chatId }: { chatId: string }) => dispatch({ type: 'MSGS_CLEAR', chatId }))
      s.on('chat:deleted', ({ chatId }: { chatId: string }) => dispatch({ type: 'CHAT_REMOVE', chatId }))
      // A socket auth error can be transient — the server may have restarted,
      // the network may have dropped, or a reconnect raced the cookie. Do NOT
      // log the user out on it. Verify against the REST API first; only a real
      // 401 there means the session is genuinely gone. Otherwise let Socket.IO
      // keep reconnecting on its own.
      s.on('connect_error', (e) => {
        if (e.message !== 'unauthorized') return
        api.get('/auth/me')
          .then(() => setTimeout(() => s.connect(), 1500)) // session fine → retry the socket
          .catch((err) => {
            if ((err as { status?: number })?.status === 401) {
              disconnectSocket()
              dispatch({ type: 'SET_ME', me: null })
            }
          })
      })
      initCallEngine({
        onCall: (call) => dispatch({ type: 'CALL', call }),
        onStreams: () => dispatch({ type: 'CALL_TICK' }),
        onToast: toast,
      })
    }

    const afterLogin = async (me: Me) => {
      dispatch({ type: 'SET_ME', me })
      setupSocket()
      await refreshChats()
    }

    const logout = async () => {
      await api.post('/auth/logout').catch(() => {})
      disconnectSocket()
      dispatch({ type: 'SET_ME', me: null })
    }

    const openChat = async (id: string) => {
      dispatch({ type: 'OPEN_CHAT', id })
      if (!stateRef.current.messages[id]) {
        const { messages } = await api.get<{ messages: Message[] }>(`/chats/${id}/messages`)
        dispatch({ type: 'MSGS_SET', chatId: id, messages })
      }
      markRead(id)
    }

    const loadEarlier = async (chatId: string) => {
      const list = stateRef.current.messages[chatId] ?? []
      const before = list[0]?.id
      if (!before) return false
      const { messages } = await api.get<{ messages: Message[] }>(
        `/chats/${chatId}/messages?before=${before}`,
      )
      dispatch({ type: 'MSGS_SET', chatId, messages, prepend: true })
      return messages.length >= 50
    }

    const sendText = async (chatId: string, body: string, replyTo?: number) => {
      const { message } = await api.post<{ message: Message }>(`/chats/${chatId}/messages`, {
        body,
        replyTo,
      })
      dispatch({ type: 'MSG_ADD', message })
      playSound('messageSent')
    }

    const sendFile: Store['actions']['sendFile'] = async (chatId, file, opts = {}) => {
      const form = new FormData()
      form.append('file', file, opts.name ?? (file instanceof File ? file.name : 'file'))
      if (opts.body) form.append('body', opts.body)
      if (opts.kind) form.append('kind', opts.kind)
      if (opts.duration) form.append('duration', String(opts.duration))
      const { message } = await api.post<{ message: Message }>(`/chats/${chatId}/messages`, form)
      dispatch({ type: 'MSG_ADD', message })
      playSound(message.kind === 'voice' ? 'voiceSent' : message.kind === 'file' ? 'fileSent' : 'photoSent')
    }

    return { afterLogin, logout, refreshChats, openChat, loadEarlier, sendText, sendFile, toast }
  }, [])

  // boot: restore session, handle email-verification links
  useEffect(() => {
    ;(async () => {
      const params = new URLSearchParams(location.search)
      const path = location.pathname
      if (path === '/verify' && params.get('token')) {
        await api.post('/auth/verify', { token: params.get('token') }).catch(() => {})
        history.replaceState(null, '', '/')
      }
      // Restore the session. A network error (e.g. a hosted server still waking
      // up) must NOT drop us to the login screen — only a real 401 does. Retry
      // a few times with backoff while the backend comes online.
      for (let attempt = 0; ; attempt++) {
        try {
          const { user } = await api.get<{ user: Me }>('/auth/me')
          dispatch({ type: 'BOOT_DONE', me: user })
          await actions.afterLogin(user)
          return
        } catch (e) {
          if ((e as { status?: number })?.status === 401 || attempt >= 4) {
            dispatch({ type: 'BOOT_DONE', me: null })
            return
          }
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))) // 1s,2s,3s,4s
        }
      }
    })()
  }, [actions])

  // theme / accent / type scale
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.dataset.theme = state.prefs.theme === 'auto' ? (sysDark ? 'dark' : 'light') : state.prefs.theme
      const [a, b] = accents[state.prefs.accent] ?? accents.aurora
      root.style.setProperty('--accent', a)
      root.style.setProperty('--accent-2', b)
      root.style.setProperty('--font-scale', String(state.prefs.fontScale))
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.prefs.theme, state.prefs.accent, state.prefs.fontScale])

  // keep the sound engine in sync with settings
  useEffect(() => {
    configureSound(state.prefs.sound)
  }, [state.prefs.sound])

  // unlock Web Audio on the first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => import('./lib/sound').then((m) => m.unlockAudio())
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // unread count in the tab title
  useEffect(() => {
    const unread = state.chats.reduce((s, c) => s + c.unread, 0)
    document.title = unread > 0 ? `(${unread}) Libera` : t('appTitle')
  }, [state.chats])

  // Resolve the language synchronously so every t() call in this render pass
  // (account choice > local pref > system) is already correct.
  setLang(resolveLang(state.me?.language, state.prefs.language))

  const store = useMemo(() => ({ state, dispatch, actions }), [state, actions])
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

// tick status for my outgoing message in a chat
export function tickFor(chat: Chat, m: Message): 'sent' | 'delivered' | 'read' {
  if (m.id <= chat.peerReadUpTo) return 'read'
  if (m.id <= chat.peerDeliveredUpTo) return 'delivered'
  return 'sent'
}
