// Shared types and pure helpers. All actual data comes from the server —
// nothing in this file defines users, chats, or messages.

export type User = {
  id: string
  username: string
  displayName: string
  bio: string
  avatar: string | null
  role: 'user' | 'moderator' | 'admin' | 'owner'
  verified?: boolean // true for owner/admin — role-derived, set by the server only
  online?: boolean
  lastSeenAt?: string | null
  createdAt?: string
  status?: string
}

export type Me = User & {
  email: string
  emailVerified: boolean
  deleteScheduledAt?: string | null
}

export type Attachment = {
  url: string
  mime: string
  size: number
  name?: string | null
  duration?: number | null
}

export type Reaction = { emoji: string; count: number; userIds: string[] }

export type MsgKind = 'text' | 'image' | 'video' | 'file' | 'voice'

export type Message = {
  id: number
  chatId: string
  senderId: string
  kind: MsgKind
  body: string | null
  replyTo: number | null
  edited: boolean
  deleted: boolean
  createdAt: string
  attachment: Attachment | null
  reactions: Reaction[]
}

export type Chat = {
  id: string
  kind: 'dm'
  peer: User
  lastMessage: Message | null
  unread: number
  muted?: boolean
  myLastReadId: number
  peerDeliveredUpTo: number
  peerReadUpTo: number
  typing?: boolean
}

export type Profile = User & { isContact?: boolean; blockedByMe?: boolean }

export type CallLogItem = {
  id: string
  chatId: string
  video: boolean
  status: 'ringing' | 'active' | 'completed' | 'declined' | 'missed' | 'failed'
  startedAt: string
  answeredAt: string | null
  endedAt: string | null
  direction: 'in' | 'out'
  peer: { id: string; username: string; displayName: string }
}

export const accents: Record<string, [string, string]> = {
  aurora: ['#4D7CFE', '#9F6BFF'],
  sky: ['#38BDF8', '#4D7CFE'],
  mint: ['#34D399', '#38BDF8'],
  sunset: ['#FB923C', '#F43F5E'],
  rose: ['#F472B6', '#A78BFA'],
  mono: ['#7C8494', '#5B6472'],
}

export const wallpapers = ['aurora', 'dusk', 'meadow', 'paper'] as const

export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

// Stable per-user avatar hue derived from the id
export function hueOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

export function fmtTime(iso: string | undefined | null) {
  if (!iso) return ''
  const d = new Date(iso + (iso.endsWith('Z') || iso.includes('+') ? '' : 'Z'))
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const days = (now.getTime() - d.getTime()) / 86400_000
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fmtLastSeen(iso: string | null | undefined) {
  if (!iso) return 'last seen recently'
  return `last seen ${fmtTime(iso)}`
}

export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000))
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtDuration(sec: number | null | undefined) {
  const s = Math.max(0, Math.round(sec ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function preview(m: Message | null): string {
  if (!m) return 'No messages yet'
  if (m.deleted) return 'Message deleted'
  switch (m.kind) {
    case 'image': return `📷 Photo${m.body ? ' · ' + m.body : ''}`
    case 'video': return `🎬 Video${m.body ? ' · ' + m.body : ''}`
    case 'voice': return `🎤 Voice message`
    case 'file': return `📎 ${m.attachment?.name ?? 'File'}`
    default: return m.body ?? ''
  }
}
