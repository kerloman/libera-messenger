# Libera Sound Identity

Libera's sounds are **synthesized in code** with the Web Audio API, not shipped
as sample files. One small engine ([`app/src/lib/sound.ts`](../app/src/lib/sound.ts))
generates the whole family from a single tonal language, so every sound is
consistent by construction and identical on Web, macOS/Windows (Electron) and
iOS/Android (Capacitor WebView) — with nothing to master, license, or keep in
sync.

## The tonal language

- **Waveforms:** soft `sine` and `triangle` partials only (never harsh saw/square).
- **Envelope:** ~8 ms exponential attack, smooth exponential release — no clicks.
- **Space:** an algorithmic convolution reverb (procedurally generated impulse)
  gives a premium sense of room without muddiness.
- **Master chain:** dry + reverb → gentle low-pass (8.2 kHz, shaves harshness)
  → compressor (glue, prevents spikes) → output. A master gain is the volume.
- **Register:** a warm C5–C7 band; pleasant, never piercing.
- **Signature motif — the "Libera bloom":** an open rising fifth→octave
  (A5 → E6 → A6) with reverb. It recurs in the incoming ringtone, call-connect
  and push sounds, so the brand is *audible*.

Because every cue shares these rules, the set feels like one instrument —
comfortable for years of daily use.

## The library

| Group | Sounds |
|---|---|
| Messages | sent · received · photo sent/received · file sent/received · voice sent/received · reaction · edited · deleted |
| Calls | incoming ringtone (the bloom) · ringback · connected · ended · declined · failed · missed · busy |
| Notifications | push · mention · friend request · new contact · added to group · added to channel · admin · security |
| Stories & UI | story published · story reaction · success · error · tap |

Each is a tiny "score" — a list of `{frequency, time, duration, gain, waveform,
reverb, glide}` notes. Sends *rise* (leaving); receives *settle*; errors are a
soft low fall (never a harsh buzz).

## Customization ("Sounds & Haptics" settings)

- **Per category** (Messages, Calls, Notifications, Stories, Groups, Channels):
  choose **Libera** (branded synth), **System** (defer to the OS), or **Silent**.
- **Master volume** slider.
- **Haptic feedback** and **Vibration** toggles.
- **Preview** every category and every individual sound before choosing.
- **Restore default sounds** in one tap.
- Settings persist per device (localStorage) and apply instantly.

## Haptics

`haptic(kind)` maps intent → feedback and uses the best API available:

1. **Native (iOS/Android under Capacitor):** `@capacitor/haptics` impact
   (light/medium/heavy) and notification (success/error). The package is an
   optional dependency, loaded dynamically; install it in the mobile shells to
   enable Taptic Engine / Android vibrator feedback.
2. **Web/Android browser fallback:** the Vibration API with tuned patterns.
3. **iOS Safari:** no Vibration API — haptics are a no-op there (honest limit).

Wired throughout: message send/receive, reactions, voice-recording start,
incoming call (looping heavy), accept/end call, success and error actions.

## Autoplay policy

Browsers require a user gesture before audio. The store unlocks the
`AudioContext` on the first `pointerdown`/`keydown`, after which all cues play.

## Honest platform notes

- **"System" mode** on the web/desktop can't play an arbitrary OS alert from a
  sandboxed page; for push notifications the OS sound plays via the Notification
  API, and in-app cues fall silent under System mode. On native shells this maps
  to the platform notification channel.
- **Choosing an arbitrary OS ringtone** (iOS ringtone, any Android notification
  sound) needs native pickers/plugins not available to the WebView; the branded
  Libera sounds and haptics work on every platform today. iOS Silent/Focus modes
  and Android channel settings are respected by the OS notification layer.
