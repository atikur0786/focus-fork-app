# FocusFork Design System

Warm, quiet product UI inspired by Cursor and Supabase: off-white surfaces, soft borders, one charcoal accent, no decorative gradients.

## Scene
Developer at a desk in a softly lit room. FocusFork feels like a calm companion app: warm neutrals, generous whitespace when onboarding, clear hierarchy when working.

## Typography
| Role | Family | Weights |
| --- | --- | --- |
| UI / body | Inter | 400, 500, 600 |
| Mono / code | JetBrains Mono | 400, 500 |

- Body line length: 65–75ch max in prose blocks
- Scale ratio: ~1.2 between heading steps in product UI
- Prefer sentence-case labels over shouty ALL CAPS kickers

## Color Tokens (Light)
| Token | Value | Usage |
| --- | --- | --- |
| `--background` | `#F7F7F4` | App/page background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, panels, sidebars |
| `--surface-hover` | `#EFEFEB` | Hover states |
| `--border` | `#E6E4DF` | Structure, dividers |
| `--primary` | `#2B2A26` | Primary buttons, emphasis |
| `--primary-hover` | `#3F3E39` | Primary hover |
| `--primary-foreground` | `#FAFAF8` | Text on primary |
| `--text-main` | `#2B2A26` | Primary text |
| `--text-secondary` | `#6F6D66` | Secondary text |
| `--text-muted` | `#9A978F` | Tertiary / disabled |
| `--destructive` | `#DC2626` | Errors |

## Color Tokens (Dark)
| Token | Value | Usage |
| --- | --- | --- |
| `--background` | `#1B1B18` | App/page background |
| `--surface` | `#232320` | Cards, panels |
| `--surface-hover` | `#2C2C28` | Hover |
| `--border` | `#343430` | Structure |
| `--primary` | `#F5F4F0` | Primary buttons |
| `--primary-hover` | `#E8E7E2` | Primary hover |
| `--primary-foreground` | `#1B1B18` | Text on primary |
| `--text-main` | `#EEEDE8` | Primary text |
| `--text-secondary` | `#A8A69E` | Secondary |
| `--text-muted` | `#73716A` | Tertiary |

## Radius
- `--radius-sm`: 0.5rem
- `--radius-md`: 0.625rem
- `--radius-lg`: 0.875rem
- `--radius-xl`: 1rem

## Layout Utilities
- `.panel`: soft bordered card, minimal shadow
- `.warm-surface`: subtle warm gradient wash for hero/onboarding only
- Avoid visible grid backgrounds on app chrome

## Component Patterns
- Login: warm split layout, single GitHub CTA
- App shell: sidebar + content + optional assistant panel
- Issue cards: full border, soft hover, no nested cards
- Approval gate: modal with clear copy, approve/reject

## Motion
- Page enter: fade + 6px translate, 200ms ease-out
- No bounce or elastic easing

## Accessibility
- Focus rings: 2px solid primary at 40% opacity
- Minimum touch target: 44px for primary actions
- Contrast: WCAG AA for all text pairs
