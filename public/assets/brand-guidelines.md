# GapFix Brand Guidelines

## Logo

The GapFix logo consists of two elements:

1. **Icon mark** — Three address-slot blocks arranged horizontally. The outer two are dimmed (representing normal HD wallet address indices). The centre block is Bitcoin orange with a checkmark, representing the gap that GapFix identifies and helps recover.

2. **Wordmark** — "Gap" in light text + "Fix" in Bitcoin orange, set in Inter 700.

### Files

| File | Use |
|------|-----|
| `logo-icon.svg` | Square icon — favicon, app icon, avatar |
| `logo.svg` | Horizontal lockup — header, dark backgrounds |
| `logo-light.svg` | Horizontal lockup — light backgrounds, print |

---

## Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Orange** (primary) | `#f7931a` | Accent, CTA, logo "Fix", highlights |
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

### Orange is the brand's only accent colour. Do not introduce additional brand colours.

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

Maintain a minimum clear zone equal to **the height of the "G" glyph** (≈ 1× cap-height) on all four sides of the logo lockup.

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

Below 24 px, use the icon mark only — the wordmark becomes illegible.

---

## Usage Rules

**Do:**
- Use `logo.svg` on dark/black backgrounds (#0d0d0d, #161616)
- Use `logo-light.svg` on white or light grey backgrounds
- Use `logo-icon.svg` alone for favicon, app store icons, and social avatars
- Preserve aspect ratio — never stretch the logo
- Keep "Gap" light and "Fix" orange in the wordmark

**Don't:**
- Recolour the icon mark (do not use non-orange centre blocks)
- Place the dark logo on backgrounds lighter than #555
- Place the light logo on backgrounds darker than #aaa
- Add drop shadows, glows, or outlines to the SVG logo
- Rearrange icon and wordmark (icon always left of wordmark)
- Use a font other than Inter for the wordmark

---

## Icon Concept

The mark depicts an HD wallet's address derivation chain:

```
[addr n-1]  ···  [addr n]  ···  [addr n+1]
  (dim)      gap   (✓ found)  resolved  (dim)
```

The dashed lines flanking the orange block represent the chain gap that Bitcoin wallets fail to scan past. The orange block with a checkmark represents GapFix identifying and resolving the hidden funds.

---

## On-Screen Header Usage

The site header already implements the logo inline. To update it with the SVG asset:

```html
<div class="logo">
  <img src="/assets/logo-icon.svg" width="28" height="28" alt="" aria-hidden="true" />
  Gap<span class="logo-accent">Fix</span>
</div>
```

Or use the full lockup:

```html
<img src="/assets/logo.svg" height="32" alt="GapFix" />
```
