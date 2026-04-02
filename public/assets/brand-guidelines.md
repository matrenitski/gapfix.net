# GapFix Brand Guidelines

## Logo

The GapFix logo consists of two elements:

1. **Icon mark** — A Bitcoin-orange rounded square containing three elements arranged horizontally: two dim address-slot blocks (left and right) representing normal HD wallet indices, and a taller dark centre block with a white checkmark, representing the gap GapFix identifies and fixes. The orange background ensures the mark is always visible regardless of page background colour.

2. **Wordmark** — "Gap" in light text + "Fix" in Bitcoin orange, set in Inter 700.

### Design rationale

The icon uses an orange background (not transparent) so it stands out on dark sites (#0d0d0d) and light backgrounds alike. The dark centre block with white checkmark reads clearly from 16 px upward.

### Files

| File | Use |
|------|-----|
| `logo-icon.svg` | Square icon — favicon, app icon, header (32 px), avatar |
| `logo.svg` | Horizontal lockup — dark backgrounds (site header, social) |
| `logo-light.svg` | Horizontal lockup — light backgrounds and print |

---

## Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Orange** (primary) | `#f7931a` | Accent, CTA, logo background, "Fix" wordmark |
| **Orange Dim** | `#c97415` | Hover states on orange elements |
| **Background** | `#0d0d0d` | Page background |
| **Surface** | `#161616` | Cards, panels |
| **Surface 2** | `#1f1f1f` | Inputs, code blocks |
| **Border** | `#2a2a2a` | Dividers, component borders |
| **Text** | `#e8e8e8` | Primary body text |
| **Text Muted** | `#888888` | Labels, secondary text |
| **Text Faint** | `#555555` | Placeholders, meta text |
| **Green** | `#22c55e` | Success states |
| **Red** | `#ef4444` | Error states |
| **Yellow** | `#eab308` | Warning states |

Orange is the brand's only accent colour. Do not introduce additional brand colours.

---

## Typography

| Role | Typeface | Weight | Notes |
|------|----------|--------|-------|
| Headings | Inter | 800 | Tight tracking (`letter-spacing: -0.02em`) |
| UI labels | Inter | 600–700 | Uppercase + 0.05em spacing for section labels |
| Body | Inter | 400 | 1.6 line height |
| Code / xpub | JetBrains Mono | 400–600 | All monospace data |

Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
```

---

## Logo Safe Area

Maintain a minimum clear zone equal to **the height of the "G" glyph** on all four sides of the logo lockup.

```
  ┌──────────────────────────────┐
  │  [clear zone: 1× cap-height] │
  │  ┌────────────────────────┐  │
  │  │  [icon]  Gap Fix       │  │
  │  └────────────────────────┘  │
  │  [clear zone: 1× cap-height] │
  └──────────────────────────────┘
```

---

## Minimum Size

| Format | Minimum |
|--------|---------|
| Icon mark alone | 16 × 16 px |
| Full horizontal lockup | 120 px wide |

Below 24 px, use the icon mark only.

---

## Usage Rules

**Do:**
- Use `logo.svg` on dark/black backgrounds
- Use `logo-light.svg` on white or light grey backgrounds
- Use `logo-icon.svg` alone for favicons, app icons, and social avatars
- Preserve aspect ratio
- Keep "Gap" light and "Fix" orange in the wordmark
- Apply `border-radius: 7px` (CSS) when rendering the icon in HTML `<img>` if the rounded corners aren't visually appearing

**Don't:**
- Recolour the icon background to anything other than `#f7931a`
- Place the icon on a background so similar to orange that it disappears
- Add additional drop shadows or outer glows
- Rearrange icon and wordmark (icon always left)
- Use a font other than Inter for the wordmark

---

## Icon Concept

```
[orange bg]
  [dim slot] · [dark block ✓] · [dim slot]
```

The dim outer slots represent normal HD wallet address derivation indices. The dark centre block is the address beyond the gap limit — found and fixed by GapFix (white checkmark inside). The orange background is the brand's visual anchor.

---

## Header HTML

```html
<div class="logo">
  <img src="/assets/logo-icon.svg" width="32" height="32" alt="" aria-hidden="true" />
  Gap<span class="logo-accent">Fix</span>
</div>
```

Or use the full lockup:

```html
<img src="/assets/logo.svg" height="36" alt="GapFix" />
```
