# The Kyle Record — Design System

## Design Philosophy

Kyle is a media library assistant. The newspaper/editorial metaphor creates a natural fit: media arrives as dispatches, downloads are bulletins, conversations are articles. This isn't decoration — it's a coherent information architecture that makes a utility feel like a publication.

## Typography

| Token                 | Font               | Usage                                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------------- |
| `--font-family-serif` | Cormorant Garamond | Display: headlines, thread titles, Kyle's byline, masthead                |
| `--font-family-sans`  | Lora               | Body text: message content, descriptions (mapped to Tailwind `font-sans`) |
| `--font-family-mono`  | JetBrains Mono     | Code blocks, tool output, technical data                                  |
| `.font-ui`            | System sans-serif  | UI chrome: timestamps, labels, navigation, search, section headers        |

**Rules:**

- Never use Inter, Roboto, or generic sans-serif for content
- Lora has no 700 weight — use 400 or 500 only (avoid synthetic bold)
- Cormorant Garamond for anything that would be a "headline" in a newspaper
- `.font-ui` class for anything that's UI chrome, not content

## Color Palette

**Principle:** Restrained color. Mostly ink on cream. Color only for:

- Links (deep blue)
- Add/remove indicators (green/red)
- Error states (burgundy)
- Kyle's identity (purple)
- Bulletin labels (amber)

| Token               | Hex       | Usage                                |
| ------------------- | --------- | ------------------------------------ |
| `bg-base`           | `#F8F5F0` | Page background (warm cream)         |
| `bg-surface`        | `#FFFFFF` | White panels                         |
| `bg-elevated`       | `#F0EDE6` | Hover states, code blocks            |
| `bg-masthead`       | `#1C1917` | Masthead, dark CTA buttons           |
| `text-primary`      | `#1C1917` | Body text (warm ink, not pure black) |
| `text-secondary`    | `#44403C` | Secondary text                       |
| `text-muted`        | `#78716C` | Timestamps, labels                   |
| `text-inverse`      | `#F8F5F0` | Text on dark backgrounds             |
| `border-rule`       | `#1C1917` | Strong horizontal rules              |
| `border-rule-light` | `#C8C2B8` | Light horizontal rules               |
| `accent-blue`       | `#1A4D8F` | Links                                |
| `accent-green`      | `#2D6A4F` | Additions                            |
| `accent-red`        | `#8B1A1A` | Errors, removals                     |
| `accent-amber`      | `#8B6914` | Bulletins                            |
| `accent-purple`     | `#5B3A8F` | Kyle identity                        |

## Layout Rules

1. **No border-radius** — Square corners everywhere
2. **Horizontal rules, not boxed borders** — Use `border-top`/`border-bottom`, never full card borders
3. **Generous whitespace** — `mb-4` between message blocks
4. **Paper texture** — Subtle noise PNG on body at very low opacity

### Rule Utilities

- `.rule-top` — Light top rule (`border-rule-light`)
- `.rule-top-strong` — 2px top rule (`border-rule`)
- `.rule-bottom` — Light bottom rule
- `.rule-double` — 3px double rule (used under masthead)

## Component Metaphors

| Component            | Metaphor           | Key Elements                                         |
| -------------------- | ------------------ | ---------------------------------------------------- |
| App.vue              | Masthead           | "The Kyle Record", tagline, date line, double rule   |
| ThreadListView       | Dispatches         | Section header with tracking, ruled dividers         |
| ThreadCard           | Headline entry     | Serif preview, system-sans byline, outline pills     |
| ThreadDetailView     | Article page       | Serif headline, editorial byline, thick rule         |
| MessageBlock (user)  | Reader letter      | Uppercase byline, thin rule, body text               |
| MessageBlock (Kyle)  | Editorial response | Serif italic byline, thicker rule, drop cap on first |
| MessageBlock (tool)  | Notes              | Muted collapsible, "NOTES" label                     |
| MessageBlock (error) | Correction         | Left border, "CORRECTION" label                      |
| WebhookBlock         | Bulletin           | Top/bottom rules, "BULLETIN" label, serif title      |
| MediaRefsSummary     | Media Index        | Strong top rule, uppercase label                     |
| DateSeparator        | Edition date       | Full date, uppercase tracking                        |
| UserAvatar (Kyle)    | Monogram           | Serif italic "K" in outlined purple circle           |

## Adding New Components

1. Use `rule-top` or `rule-top-strong` for visual separation (not card borders)
2. Headlines in `font-serif`, labels in `.font-ui`
3. Square corners — never `rounded-*`
4. Timestamps and meta info always `.font-ui`
5. Links use `text-accent-blue` with dotted underline
6. Keep color restrained — ask "would a newspaper use this color?"

## Things to Avoid

- Rounded corners (`rounded-*`)
- Bright/saturated colors
- Boxed card borders (full border around content)
- Generic sans-serif body text
- Left-border color coding (old pattern)
- `color-mix()` with dark backgrounds
- Loading `font-weight: 700` for Lora
