# Libera Design System — "Liquid Glass"

iOS 26 Liquid Glass design language: layered translucency, real blur, specular edge
highlights, continuous (squircle) corners, physics-based motion.

## 1. Color

### Brand Palette
| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#4D7CFE` | `#5E8BFF` | Primary actions, outgoing bubbles |
| `--accent-2` | `#9F6BFF` | `#AC7DFF` | Gradient partner, stories ring |
| `--aurora` | `linear-gradient(135deg, #4D7CFE, #9F6BFF)` | same | Signature "Aurora" gradient |
| `--ink` | `#0B0D12` | `#F4F6FB` | Primary text |
| `--ink-2` | `#5B6472` | `#9AA3B2` | Secondary text |
| `--bg` | `#F2F4F8` | `#07090E` | Canvas |
| `--surface` | `rgba(255,255,255,.72)` | `rgba(22,26,35,.66)` | Glass panels |
| `--stroke` | `rgba(11,13,18,.08)` | `rgba(255,255,255,.09)` | Hairlines |
| `--success` | `#30C465` | — | Online, delivered |
| `--danger` | `#FF4D5E` | — | Destructive, recording |

Accent is user-selectable (Dynamic Colors): Aurora (default), Sky, Mint, Sunset, Rose, Mono.

### Rules
- Glass surfaces always pair `backdrop-filter: blur(24–40px) saturate(1.6–1.8)` with a
  translucent fill and a 1px inner top highlight (`inset 0 1px 0 rgba(255,255,255,.x)`).
- Never place glass on glass more than two layers deep.
- Text on glass must meet WCAG AA (4.5:1) — verified per theme.

## 2. Typography
System-first stack (SF Pro on Apple platforms):
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Inter, sans-serif`

| Style | Size/Line | Weight | Tracking |
|---|---|---|---|
| Large Title | 34/41 | 700 | -0.4 |
| Title 1 | 28/34 | 700 | -0.3 |
| Title 2 | 22/28 | 700 | -0.2 |
| Headline | 17/22 | 600 | -0.2 |
| Body | 17/22 | 400 | -0.2 |
| Subhead | 15/20 | 400 | -0.1 |
| Footnote | 13/18 | 400 | 0 |
| Caption | 11/13 | 500 | 0.1 |

Dynamic Type: all sizes scale with `--font-scale` (0.85–1.3, user setting).

## 3. Shape
- Continuous corners (squircle feel): radii 10 / 14 / 18 / 22 / 28.
- Bubbles: 20px radius, 6px on the "tail" corner.
- Cards & sheets: 22–28px. App icon: iOS squircle mask.

## 4. Elevation & Glass Recipe
```css
.glass {
  background: var(--surface);
  backdrop-filter: blur(28px) saturate(1.7);
  border: 1px solid var(--stroke);
  box-shadow: 0 8px 32px rgba(6,10,20,.10), inset 0 1px 0 rgba(255,255,255,.35);
}
```
Dark mode swaps the inner highlight to `rgba(255,255,255,.08)`.

## 5. Motion
- Curve: `cubic-bezier(.32,.72,.28,1)` ("Libera ease") for navigation; spring
  (stiffness 420, damping 34) for bubbles and sheets.
- Durations: micro 160ms, standard 280ms, sheets 420ms.
- New message: scale .92→1 + translateY 8→0. Reactions: pop 1→1.25→1.
- Respect `prefers-reduced-motion`: crossfade only.

## 6. Iconography
SF Symbols on Apple platforms; the web/app client ships a matched 24×24 stroke set
(1.8px stroke, round caps) — see `app/src/ui/Icons.tsx`.

## 7. Layout
- Phone: single column, 16px gutters, tab bar 84px (floating glass pill).
- ≥900px: two-pane (list 380px + conversation), sidebar navigation.
- Safe areas: `env(safe-area-inset-*)` respected on all fixed chrome.

## 8. Logo Usage
- Clear space: 25% of mark height on all sides. Never smaller than 20px (mark) / 96px (lockup).
- On photography/gradients use the monochrome white version at 92% opacity.
- Never: recolor outside the palette, add drop shadows to the flat mark, rotate, outline.
- Files: `brand/` — primary, mono, light/dark, app icon, favicon, splash.
