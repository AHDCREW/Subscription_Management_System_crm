# SubFlow UI guidelines

These rules apply to every screen. Build pages from `@/components/kit` (shadcn-based), `@/components/ui/*` and `@/components/motion` (React Bits).

## 1. Colour roles

Each colour has **one meaning** across the whole app. Use theme tokens only. Never use raw Tailwind palette classes (`slate-500`, `indigo-600`, `emerald-700`, …) in app code.

| Role | Token | Use for | Never for |
|---|---|---|---|
| **Primary** (near-black) | `primary` | The main action on a screen, "Confirmed", the one featured card | Decoration, categories, counts |
| **Brand** (orange) | `brand` | Logo mark and focus ring only | Buttons, text, status, backgrounds |
| **Neutral** (cool grey) | `canvas`, `sidebar`, `card`, `foreground`, `muted-foreground`, `muted`, `border` | Canvas, frame, panels, text, dividers, drafts, categories | — |
| **Success** (green) | `success` | Active, paid, completed, "rule met" | Buttons |
| **Info** (blue) | `info` | In progress, quotation sent | — |
| **Warning** (amber) | `warning` | Needs attention soon: paused, expiring, inactive dependency | Errors |
| **Danger** (red) | `destructive` | Overdue, failed, validation errors, destructive actions | Normal endings (closed, cancelled) |

Surfaces use the token at low opacity (`bg-success/10 text-success`). Text uses the token directly.

**Layout:** grey `canvas` → a rounded light `sidebar` frame holding the left navigation → a white rounded content panel (`AppShell`). Every page starts with `PageHeader`, a bar across the top of the panel with the title on the left and actions on the right.

**Surfaces:** cards are white, `rounded-xl`, 1px border and `shadow-xs`. Exactly one **featured** card per screen may use the dark near-black gradient (`StatCard featured`, the yearly plan on /pricing). No other gradients, glows or coloured shadows.

**Badges** are white pills with a coloured status dot (`Badge tone`). **Tabs** are segmented pills: grey track, white active pill. **Tables** sit inside a card with a grey rounded header row. **Links** are ink text with a quiet underline.

### Status colours

| Thing | Status → badge `tone` |
|---|---|
| Subscription | Draft → `gray` · Quotation → `blue` · Confirmed → `indigo` (ink) · Active → `green` · Paused → `amber` · Closed → `gray` |
| Invoice | Draft → `gray` · Confirmed → `indigo` · Paid → `green` · Cancelled → `gray` · **Overdue → `red`** |
| Product / plan | Active → `green` · Inactive → `gray` (`<Badge>`) |
| Categories (product type, billing period) | `outline`, never a status colour |
| Counts | `gray` (`<Badge>`) |

Red is reserved for things someone must act on, so overdue invoices stand out.

## 2. Button hierarchy

1. **One primary button per view.** This is the main thing the user came to do: Save, Create, Run billing, Pay now. `<Button>` / `<ButtonLink>` with no variant.
2. **Secondary** for other useful actions: `variant="secondary"` (outline). Examples: Add line, Add variant, Filter, Next page.
3. **Tertiary** for Cancel, Back and Remove row: `variant="ghost"`.
4. **Destructive** only for irreversible actions, always behind a confirm: `variant="danger"`.

When a page shows an empty state with a call to action, hide the duplicate primary button in the header. A dialog is its own view and gets its own single primary.

## 3. Type scale

| Level | Style | Component |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` (animated) | `PageHeader` |
| Section / card title | `text-base font-semibold` | `SectionHeader` |
| Body | `text-sm` | default |
| Labels, meta, help, table headers | `text-xs text-muted-foreground` | `Field` hint, `DetailItem` label, `Th` |
| Numbers | `tabular-nums`; totals `font-semibold` | — |

There's only one `h1` per page, and headings never skip a level.

## 4. Layout and spacing

- Page sections: `gap-6` / `space-y-6`. Cards: `p-6`. Form fields: `space-y-4`.
- Detail pages: a `dl` grid of `DetailItem`s, then cards for related lists.
- Content width is capped by the layout (`max-w-6xl` dashboard, `max-w-5xl` portal).

## 5. Motion

- Pages fade up on navigation (`template.tsx`). Lists and tables fade in. Stat numbers count up (`StatCard`).
- Keep it soft: under 0.6s, small distances, no loops, nothing that blocks input.
- `loading.tsx` shows skeletons while data loads.
