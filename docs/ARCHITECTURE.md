# Libera — Architecture

The repository ships a working single-node stack: an Express + Socket.IO backend with an
embedded SQLite database (`server/`) and a React client (`app/`). This document records
that design and the target architecture for scaling beyond one node.

## 1. Platform strategy

One TypeScript core, three shells:

- **Web / Desktop** — the React client in `app/` (PWA; wrapped with Tauri for macOS/Windows).
- **iOS / iPadOS / Android** — React Native (or Flutter) shells reusing the same design
  tokens (`styles.css` variables have 1:1 native equivalents) and the same protocol SDK.
- **Admin** — same web bundle, role-gated route.

All product screens consume a single `Store` interface (see `app/src/store.tsx`):
`send()`, dispatchable actions, and selector helpers. The demo implementation is
in-memory; the production implementation is the SDK below. Screens do not change.

## 2. Backend (Node)

```
clients ──TLS──> edge (Cloudflare) ──> API gateway (NestJS)
                                        ├─ REST /v1 (auth, profiles, media tickets, search)
                                        ├─ WS Socket.IO (messages, presence, typing, receipts)
                                        └─ WebRTC SFU (LiveKit) for calls
services: auth · messaging · media · stories · notifications · moderation · analytics
data:     PostgreSQL 16 (source of truth, partitioned messages)
          Redis (presence, typing, rate limits, socket pub/sub, hot counters)
          S3-compatible object store (media, E2EE blobs)
          ClickHouse (analytics events, admin dashboards)
queues:   BullMQ (push fan-out, transcodes, spam scoring, scheduled messages)
```

### Messaging flow
1. Client encrypts message (see SECURITY.md), POSTs ciphertext or emits over WS.
2. Gateway validates rate limits (Redis token bucket), persists to Postgres
   (`messages` partitioned by `chat_id` hash + month), publishes to Redis pub/sub.
3. Socket.IO nodes fan out to online members; BullMQ enqueues APNs/FCM push for offline.
4. Receipts (`delivered`, `read`) flow back over WS and are stored as per-member cursors,
   not per-message rows — this is what keeps 100k-member groups cheap.

### Scale notes
- Socket nodes are stateless; sticky-session by `user_id` via the edge. Horizontal scale
  is adding nodes to the Redis adapter ring.
- Channels/large groups use **fan-out-on-read**: one stored copy, member cursors, push
  digests batched per device.
- Media uploads go direct-to-S3 with presigned tickets; transcodes (voice waveforms,
  video previews, sticker sheets) run on workers.
- Full-text search: Postgres `tsvector` per chat for private search on server-side
  metadata only; message bodies are E2EE, so global search runs client-side over the
  local store (SQLite on device).

## 3. Key schema (Postgres)

```sql
users(id, username uniq, display_name, bio, birthday, avatar_id, created_at, flags)
devices(id, user_id, kind, push_token, identity_key, last_seen_at)
chats(id, kind dm|group|channel, title, owner_id, settings jsonb)
chat_members(chat_id, user_id, role owner|admin|moderator|member, joined_at,
             read_cursor, notify_level, pinned_at, folder)
messages(id bigserial, chat_id, sender_id, kind, ciphertext bytea, meta jsonb,
         reply_to, edited_at, deleted_at, pinned, created_at)  -- partitioned
reactions(message_id, user_id, emoji)
stories(id, user_id, kind, media_id, expires_at)
story_views(story_id, viewer_id, reacted_emoji)
reports(id, reporter_id, target_kind, target_id, reason, status, resolved_by)
```

## 4. Realtime events (Socket.IO)

`msg:new · msg:edit · msg:delete · msg:react · receipt:delivered · receipt:read ·
typing:start/stop · presence:online/away · story:new · call:offer/answer/ice ·
chat:member_join/leave · admin:broadcast`

## 5. Notifications
- APNs + FCM through the notification service; per-chat notify levels honored server-side.
- Push payloads for E2EE chats carry only `chat_id` + counter — content is rendered
  on-device after decryption (like WhatsApp/Signal).

## 6. AI features
- Smart replies + translation run **on-device** (small distilled models) so ciphertext
  never leaves the E2EE boundary. Libera AI assistant is an explicit opt-in bot chat
  where messages are (visibly) not E2EE.

## 7. Admin panel
Role-gated (`owner`, `staff`) web app talking to `/v1/admin/*`: aggregates from
ClickHouse (DAU, message volume, growth), moderation queues from `reports`, ban writes
to `users.flags`, broadcast composer → push fan-out worker. Every admin action is
recorded in an append-only `audit_log`.
