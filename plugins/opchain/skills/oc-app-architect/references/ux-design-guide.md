# UX Design Pipeline Reference

This document defines the structured design-to-build pipeline. Design is not a single spec
section — it's a multi-stage process with approval gates that feeds directly into
implementation. Each stage produces a concrete deliverable, and nothing moves forward
without explicit user approval.

## Table of Contents
1. Pipeline Overview
2. Stage 1: Design Documentation & Style Book
3. Stage 2: Wireframe Review (Idea Phase)
4. Stage 3: Wireframe Mockup Build
5. Stage 4: Design Direction Approval (Gate)
6. Stage 5: Screen & Component Punch List
7. Stage 6: Punch List Approval (Gate)
8. Stage 7: Frontend Build
9. Stage 8: Backend Hookup
10. Component Design System
11. Accessibility Checklist
12. Common UI Patterns by App Type

---

## 1. Pipeline Overview

```
STAGE 1: Design Documentation & Style Book
  → Deliverable: Interactive HTML style book
STAGE 2: Wireframe Review (Idea Phase)
  → Deliverable: Annotated text + ASCII wireframes per screen
STAGE 3: Wireframe Mockup Build
  → Deliverable: Clickable HTML wireframe prototype
★ GATE 1: Design Direction Approval
STAGE 4: Screen & Component Punch List
  → Deliverable: Exhaustive TODO checklist (every screen, component, state, interaction)
★ GATE 2: Punch List Sign-off
STAGE 5: Frontend Build
  → Deliverable: Working frontend with mock data
STAGE 6: Backend Hookup
  → Deliverable: Fully functional application
★ GATE 3: UAT (User Acceptance Testing)
```

---

## 2. Stage 1: Design Documentation & Style Book

Before any screen is designed, define the visual language. This prevents ad-hoc design
decisions and ensures consistency across every screen.

### What to Define

**Color Palette:**
- Primary color (brand identity, CTAs, active states)
- Secondary color (supporting elements, hover states)
- Accent color (highlights, notifications, badges)
- Neutral scale (background, borders, text — typically 5-7 shades from white to near-black)
- Semantic colors: success (green), warning (amber), error (red), info (blue)
- Each color needs: hex value, usage rule, contrast ratio against its typical background

**Typography:**
- Primary typeface (headings) — name, weights available, fallback stack
- Secondary typeface (body) — name, weights, fallback stack
- Monospace typeface (code, data) — if applicable
- Type scale with explicit values:
  - Display: 36-48px, bold, tight leading
  - H1: 28-32px
  - H2: 22-24px
  - H3: 18-20px
  - Body: 14-16px
  - Small/Caption: 12-13px
  - Micro: 10-11px (badges, labels)

**Spacing & Layout:**
- Base unit (4px or 8px)
- Spacing scale: xs(4), sm(8), md(16), lg(24), xl(32), 2xl(48), 3xl(64)
- Container max-width (typically 1280px)
- Grid system (12-column, gutter width)
- Breakpoints: xs(0), sm(640), md(768), lg(1024), xl(1280)

**Borders & Surfaces:**
- Border radius scale: none(0), sm(4), md(8), lg(12), full(9999)
- Border colors (which neutral shades for dividers, inputs, cards)
- Shadow scale: sm (subtle card lift), md (elevated dropdown), lg (modal overlay)
- Surface hierarchy (page bg, card bg, input bg, elevated bg)

**Icons & Logos:**
- Icon library choice (Lucide, Heroicons, Phosphor, custom) with rationale
- Icon sizing: sm(16), md(20), lg(24), xl(32)
- Icon color rules (inherit text color, semantic for status, muted for decoration)
- Logo: full wordmark, icon-only, minimum display size, required clear space

**Design Rules (the non-negotiable constraints):**
- Minimum tap target: 44x44px on mobile
- Maximum content width for readability: 65-75 characters per line
- Input field heights: sm(32), md(40), lg(48)
- Button anatomy: padding, font size, min-width per size variant
- Card anatomy: padding, header/content/footer spacing
- Focus indicator: 2px offset ring in primary or high-contrast color
- Z-index layers: base(0), dropdown(10), sticky(20), modal(30), toast(40)

### Deliverable: Interactive HTML Style Book

Build a single HTML file the user opens in their browser. It renders every token live:

```
┌─────────────────────────────────────────────┐
│  [App Name] Design System                   │
├─────────────────────────────────────────────┤
│  COLORS                                     │
│  [swatch] Primary #3B82F6  "CTAs, links"   │
│  [swatch] Secondary #10B981  "Success"      │
│  [swatch] Neutral-50 through Neutral-900    │
├─────────────────────────────────────────────┤
│  TYPOGRAPHY                                 │
│  Display  — Inter 36px/40px Bold            │
│  H1 — Inter 28px/32px Semibold              │
│  Body — Inter 16px/24px Regular             │
│  Each rendered as a live sample              │
├─────────────────────────────────────────────┤
│  SPACING (visual blocks at each scale)      │
├─────────────────────────────────────────────┤
│  BORDERS & SHADOWS (rendered cards/inputs)  │
├─────────────────────────────────────────────┤
│  BUTTONS (all variants x all sizes)         │
│  [Primary SM] [Primary MD] [Primary LG]    │
│  [Secondary] [Ghost] [Destructive]          │
│  + hover/active/disabled states visible     │
├─────────────────────────────────────────────┤
│  FORM ELEMENTS                              │
│  Text input, Select, Checkbox, Radio, Toggle│
│  Each in default + focus + error + disabled │
├─────────────────────────────────────────────┤
│  ICONS (sample grid at each size)           │
├─────────────────────────────────────────────┤
│  ASSEMBLED EXAMPLES                         │
│  Card, Badge, Toast, Alert — in context     │
└─────────────────────────────────────────────┘
```

This is iterative. The user reviews, says "make the primary darker" or "try a different
heading font," and Claude regenerates until approved.

---

## 3. Stage 2: Wireframe Review (Idea Phase)

Before building anything visual, describe each screen conceptually. This is the cheapest
place to change direction — text is faster to revise than HTML.

### For Each Screen, Document:
```
Screen: [Name] ([/route])
Purpose: [One sentence — what the user accomplishes here]

Layout:
┌──────────────────────────────────────┐
│  [ASCII art showing major zones]     │
│  [Header, sidebar, content, footer]  │
└──────────────────────────────────────┘

Key elements:
- [Component name]: [what it shows/does]

Primary action: [The #1 thing a user does here]
Secondary actions: [Other available actions]

States:
- Loading: [what shows]
- Empty: [what shows + CTA]
- Error: [what shows + recovery]
- Overflow: [pagination/scroll/truncation]

Navigation:
- Arrives from: [which screens/actions]
- Goes to: [which screens on what action]
```

### Screen Inventory
List ALL screens including ones that feel "obvious":
- Auth screens (login, signup, password reset, email verification)
- Core feature screens
- Settings / profile / preferences
- Admin screens (if applicable)
- Error screens (404, 500, offline, unauthorized)
- Modals and dialogs (these are screens too)
- Onboarding / first-run experience
- Empty states (first use before any data exists)

---

## 4. Stage 3: Wireframe Mockup Build

Take approved wireframe descriptions and build them as interactive HTML prototypes
using the style book's design tokens.

### Requirements:
- **Clickable navigation**: Click between screens to feel the flow
- **Real layout**: Actual grid, breakpoints, spacing from style book
- **Realistic data**: Fake but plausible (real names, real dates, realistic quantities)
- **All states**: Loading, empty, error states visible (toggle-able or on sub-pages)
- **Responsive**: Test at 375px, 768px, 1280px
- **No backend**: All data hardcoded — purely frontend

### Build Approach
Single HTML file with hash-based routing:
```html
<div id="screen-dashboard" class="screen active">...</div>
<div id="screen-list" class="screen">...</div>
<div id="screen-detail" class="screen">...</div>
<!-- Simple JS toggles .active class on navigation -->
```

Or a small set of linked HTML files if screens are complex.

### What the User Evaluates:
- Does the information hierarchy work? (most important = most prominent)
- Does navigation feel natural?
- Are the right actions available on each screen?
- Does responsive behavior work on their actual phone?
- Any missing screens?

---

## 5. Stage 4: Design Direction Approval (★ Gate 1)

**Hard stop.** Present:
1. Interactive style book HTML
2. Clickable wireframe HTML prototype
3. Summary of design decisions with rationale

Ask explicitly: "Review both files in your browser. What would you change? Once approved,
I'll build the detailed component punch list."

Iterate until the user says they're happy. Common feedback:
- Color/font adjustments
- Layout rearrangements
- Missing screens discovered
- "Too much/too little on this screen"

---

## 6. Stage 5: Screen & Component Punch List

After design direction is approved, produce the exhaustive build checklist. This is the
complete inventory of everything to be built.

### Punch List Organization

Organize by screen, then component within screen. Every item gets a T[phase].[step]
number with CLAUDE/USER prefix.

```markdown
## Screen: Dashboard (/dashboard)

### Layout
CLAUDE T[N].x — Build dashboard page layout
  - Navbar + sidebar + main content area
  - Responsive: sidebar collapses to hamburger < 1024px
  - Max-width container: 1280px centered

### Stat Cards (x3)
CLAUDE T[N].x — Build StatCard component
  Variants: default, highlighted (primary border-left)
  Props: label (string), value (number), trend (up|down|flat), icon (LucideIcon)
  States:
    - Default: renders label + value + trend arrow + icon
    - Loading: skeleton pulse (same dimensions)
    - Error: shows "—" with tooltip "Failed to load"
  Interactions:
    - Click card → navigates to filtered list view for that metric
    - Hover → subtle shadow elevation
  Responsive: 3-column on desktop, 2-column on tablet, stack on mobile

### Activity Table
CLAUDE T[N].x — Build ActivityTable component
  Columns: name (link), status (badge), date (relative), actions (dropdown menu)
  Props: data[], loading (boolean), emptyMessage (string)
  States:
    - Default: renders rows with data
    - Loading: 5 skeleton rows matching column widths
    - Empty: centered icon + emptyMessage + CTA button
    - Error: error banner with retry button
    - Overflow (>50 rows): pagination footer
  Interactions:
    - Click row → navigate to detail screen
    - Click column header → sort asc/desc (arrow indicator)
    - Click status badge → no action (display only)
    - Click actions "..." → dropdown menu: [Edit, Archive, Delete]
    - Click "Delete" → confirmation dialog: "Delete [name]? This cannot be undone."
    - Confirm delete → optimistic remove + toast "Deleted" with undo (5s)
  Responsive: horizontal scroll on < 768px, sticky first column
  Keyboard: arrow keys navigate rows, Enter opens detail, Tab to actions
```

### Punch List Rules

**Every interaction must be documented.** If a user can tap, click, hover, swipe, type,
or press a key to trigger it, it's on the list:
- Button clicks (what happens?)
- Link navigation (where?)
- Form submissions (validate what? call what API? show what feedback?)
- Hover effects (tooltip? color change? elevation?)
- Keyboard shortcuts
- Swipe gestures (mobile)
- Drag and drop
- Modal triggers and dismissal
- Sort/filter controls
- Pagination / infinite scroll
- Toggle switches
- Dropdown expand/collapse

**Every state must be listed per component:**
- Default (happy path with data)
- Loading (skeleton or spinner — specify which)
- Empty (no data — what CTA? what illustration?)
- Error (what message? what recovery action?)
- Disabled (when? why? visual treatment)
- Hover / Active / Focused (visual change)
- Overflow (too much data — truncate? paginate? scroll?)

**Every screen must be listed.** Including:
- "Obvious" screens (login, 404, settings)
- Modal/dialog screens
- Slide-over/panel screens
- Confirmation dialogs
- Success/error pages post-action
- Onboarding/first-run screens

---

## 7. Stage 6: Punch List Approval (★ Gate 2)

**Hard stop.** Present the complete punch list.

Ask: "This is everything that will be built — every screen, component, state, and
interaction. Review it: anything missing? Anything to cut? Any interactions wrong?"

The punch list IS the scope. If it's not on the list, it doesn't get built. This is
where scope creep gets caught before it costs real build time.

---

## 8. Stage 7: Frontend Build

Build everything from the punch list in the chosen framework using the approved design tokens.

### Build Order (dependency-based)
1. **Design token layer** — CSS variables / Tailwind config matching style book exactly
2. **Base components** — Button, Input, Badge, Card, Avatar, Icon wrapper
3. **Composite components** — DataTable, Form, Modal, Sidebar, Toast container
4. **Layout components** — AppLayout, AuthLayout, SettingsLayout
5. **Screen pages** — Each screen from the punch list, top to bottom
6. **Navigation / routing** — Wire screens together, guards, redirects

### Build Constraints
- **Mock data only** — No API calls. Use hardcoded JSON or factory functions.
- **Every state implemented** — All documented states from punch list rendered.
- **Every interaction wired** — Even if the handler is a console.log placeholder for now.
- **Responsive verified** — Every screen tested at 375px, 768px, 1280px.
- **Accessible** — Semantic HTML, ARIA roles, keyboard navigation, focus management.
- **Cross-reference punch list** — Mark items complete as you build them.

### Deliverable
A working frontend the user can click through: every screen, every state, realistic
mock data. No backend dependency.

---

## 9. Stage 8: Backend Hookup

Replace mock data with real API calls, auth, and database operations. The UI should NOT
change during this stage.

### Hookup Order
1. **Auth** — Replace mock auth with real provider (login, signup, session, logout)
2. **Read operations** — Replace hardcoded data with API fetches (GET endpoints)
3. **Write operations** — Wire forms to POST/PATCH/DELETE
4. **Real-time** — Connect WebSocket/subscription listeners (if applicable)
5. **Error handling** — Replace console.logs with real error states, toasts, retries
6. **Loading states** — Connect skeletons to actual fetch timing

### Rules
- If the API response shape doesn't match what the frontend expects, change the API
  (add a transform layer), not the UI. The frontend was already approved.
- Test each hookup individually before moving to the next.
- Run the full flow end-to-end after all hookups complete.

### Deliverable
Fully functional application with real data, real auth, real persistence.

---

## 10. Component Design System

### Component Categories
| Category | Components |
|---|---|
| Layout | Container, Stack, Row, Grid, Sidebar, Card |
| Navigation | Navbar, Sidebar nav, Breadcrumbs, Tabs, Pagination |
| Data Display | Table, Stat card, Badge, Avatar, Empty state, Skeleton |
| Input | Text, Select, Checkbox/Radio, Toggle, Date picker, File upload, Search |
| Feedback | Toast, Alert banner, Progress/Spinner, Confirmation dialog |
| Overlay | Modal, Slide-over, Dropdown menu, Tooltip, Command palette |

### Per-Component Spec (use in punch list)
Every component documents: purpose, variants (with when-to-use), props, states (default/hover/active/focused/disabled/loading/error), responsive behavior, and accessibility (ARIA role, keyboard interaction, screen reader announcement).

### Principles
- **Composition over configuration** — Small composable components, not mega-components
- **Consistent tokens** — All spacing, colors, radii from the style book
- **State-first** — Every component handles loading, empty, error, overflow

---

## 11. Accessibility Checklist

### Perceivable
- [ ] Color contrast >= 4.5:1 for text, 3:1 for large text
- [ ] Information not conveyed by color alone (add icons or text)
- [ ] Images have alt text (decorative: alt="")
- [ ] Text resizes to 200% without breaking layout

### Operable
- [ ] All elements reachable via keyboard (Tab, Shift+Tab)
- [ ] Focus order follows visual order
- [ ] Focus indicator is visible (never remove without replacing)
- [ ] No keyboard traps
- [ ] Modals trap focus and return on close

### Understandable
- [ ] Labels associated with inputs (htmlFor/id or wrapping label)
- [ ] Error messages explain what's wrong and how to fix it
- [ ] Consistent navigation across pages

### Robust
- [ ] Semantic HTML (button for buttons, not div with onClick)
- [ ] ARIA roles used correctly where native semantics insufficient
- [ ] Tested with screen reader

---

## 12. Common UI Patterns by App Type

### CRUD / Admin Tool
Table with sort/filter/search/bulk actions, slide-over for records, confirmation dialogs,
toast notifications, empty states with CTA.

### Dashboard / Analytics
Stat cards with period comparison, charts with tooltips, date range picker, auto-refresh
with timestamp, CSV/PDF export.

### Marketplace / E-commerce
Product grid, filter sidebar (collapsible on mobile), quick view vs. detail, cart with
quantity, multi-step checkout with progress indicator.

### Content / Documentation
ToC sidebar (sticky, highlights current), search with highlighting, breadcrumbs,
"Was this helpful?" feedback component.
