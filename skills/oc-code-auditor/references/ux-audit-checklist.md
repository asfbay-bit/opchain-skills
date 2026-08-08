# UX Audit Checklist

Detailed checks for the `/oc-audit ux` mode. The SKILL.md gives the overview and
automated check commands; this document provides the full manual review protocol.

---

## 1. Accessibility (WCAG 2.1 AA)

### Perceivable

| Check | How to Verify | Pass Criteria |
|---|---|---|
| Color contrast (text) | Use browser devtools accessibility panel or `axe-core` | All text ≥ 4.5:1, large text (18px+ or 14px bold) ≥ 3:1 |
| Color contrast (UI) | Check buttons, icons, borders against their backgrounds | All UI components ≥ 3:1 against adjacent colors |
| Color not sole indicator | Review error states, status badges, form validation | Every color meaning has a secondary indicator (icon, text, pattern) |
| Alt text on images | Grep for `<img` without `alt=` | Informative images have descriptive alt, decorative have `alt=""` |
| Text resize | Set browser to 200% zoom | Layout doesn't break, no horizontal scroll, no text clipping |
| Media captions | Check video/audio elements | Captions or transcripts provided (if applicable) |

### Operable

| Check | How to Verify | Pass Criteria |
|---|---|---|
| Keyboard reachability | Tab through entire app without mouse | Every interactive element is focusable in logical order |
| Focus indicator | Tab through app, check visibility | Every focused element has a visible ring/outline (not removed) |
| No keyboard traps | Tab into and out of every modal, dropdown, date picker | Can always exit with Escape or Tab |
| Modal focus management | Open modal, check focus moves inside; close, check focus returns | Focus enters modal on open, returns to trigger on close |
| Touch targets | Measure interactive elements on mobile viewport | All touch targets ≥ 44x44px (buttons, links, checkboxes) |
| Skip navigation | Check for skip-to-content link | Present on pages with repeated navigation |

### Understandable

| Check | How to Verify | Pass Criteria |
|---|---|---|
| Form labels | Check every input for `<label>` association | Every input has a visible label linked via htmlFor/id or wrapping |
| Error messages | Trigger validation errors | Errors explain what's wrong AND how to fix it, appear near the field |
| Consistent navigation | Navigate between pages | Nav structure is identical across pages |
| Language attribute | Check `<html lang="en">` | Present and correct |
| Predictable behavior | Click around | No unexpected page changes, popups, or context shifts |

### Robust

| Check | How to Verify | Pass Criteria |
|---|---|---|
| Semantic HTML | Read component source | Buttons are `<button>`, links are `<a>`, lists are `<ul>/<ol>`, landmarks present |
| ARIA correctness | Review ARIA attributes | No redundant ARIA (aria-label on elements with visible text), correct roles |
| Valid HTML | Run through validator or linter | No duplicate IDs, properly nested elements |

### Automated A11y Checks

```bash
# If the project has a dev server running, use axe-core via Playwright
npx playwright test --grep accessibility 2>/dev/null

# Or run axe-core via CLI on a built HTML file
npx @axe-core/cli <url-or-file> 2>/dev/null

# Quick grep-based checks (always available)
# Missing alt text
grep -rn "<img" --include="*.tsx" --include="*.jsx" --include="*.html" . \
  | grep -v "alt=" | grep -v node_modules

# Div buttons (should be <button>)
grep -rn "<div.*onClick\|<span.*onClick" --include="*.tsx" --include="*.jsx" . \
  | grep -v node_modules

# Removed focus outlines
grep -rn "outline.*none\|outline.*0\|\*:focus.*outline" --include="*.css" --include="*.scss" --include="*.tsx" . \
  | grep -v node_modules
```

---

## 2. Component State Coverage

Every data-driven component must handle 4 core states. For each component, check:

| State | What to Look For | Example |
|---|---|---|
| **Loading** | Skeleton, spinner, or placeholder while data fetches | A table shows skeleton rows before API returns |
| **Empty** | Meaningful empty state with guidance, not blank space | "No sessions recorded yet. Tap + to add one." |
| **Error** | User-facing error message with recovery action | "Couldn't load data. Tap to retry." |
| **Disabled** | Visual indication that interaction is blocked | Submit button grays out during form submission |

### How to Audit State Coverage

1. List all components that fetch or display data
2. For each, check which states are handled:
   ```
   ComponentName     Loading  Empty  Error  Disabled
   SessionList       ✅       ❌     ❌     N/A
   DoseForm          ✅       N/A    ✅     ❌
   StatsCard         ❌       ❌     ❌     N/A
   ```
3. Score: (states handled / states applicable) × 100%
4. Anything below 60% gets a HIGH finding

### Common Failures

- **Console.log errors**: `catch(e) { console.log(e) }` — the user sees nothing
- **Conditional render without fallback**: `{data && <List data={data} />}` — blank when null
- **No loading on slow connections**: Component renders empty → data pops in (layout shift)
- **Submit without disable**: User double-clicks → duplicate submission

---

## 3. Design Consistency

### Token Compliance

Check whether the project uses a design system or hardcodes values:

```bash
# Count hardcoded colors vs. CSS variables
HARDCODED=$(grep -rn "color:\s*#\|background:\s*#\|border.*#" --include="*.css" --include="*.scss" --include="*.tsx" . \
  | grep -v node_modules | grep -v "var(--" | wc -l)
TOKENIZED=$(grep -rn "var(--" --include="*.css" --include="*.scss" --include="*.tsx" . \
  | grep -v node_modules | wc -l)
echo "Hardcoded: $HARDCODED, Tokenized: $TOKENIZED"
RATIO=$((TOKENIZED * 100 / (HARDCODED + TOKENIZED + 1)))
echo "Token usage: ${RATIO}%"
```

| Score | Token Usage | Grade |
|---|---|---|
| 90%+ | Almost all values from tokens | Consistent |
| 60-89% | Mix of tokens and hardcoded | Mixed |
| < 60% | Mostly hardcoded | Inconsistent |

### Spacing Audit

```bash
# Find all unique pixel values used for margin/padding
grep -rnoP "(margin|padding)[^;]*:\s*\K\d+px" --include="*.css" --include="*.scss" . \
  | grep -v node_modules | sort | uniq -c | sort -rn | head -15
```

If more than 8 unique spacing values exist, the spacing scale isn't being followed.

### Pattern Consistency

Review for these anti-patterns:
- Same UI pattern implemented different ways (2 different modal implementations)
- Inconsistent button hierarchy (some pages use filled primary, others use outlined)
- Mixed form layouts (some inline labels, some stacked, no clear rule)
- Navigation that changes structure between pages

---

## 4. Responsive Behavior

### Breakpoint Coverage

Check at three viewports minimum:
- **Mobile**: 375px (iPhone SE / small Android)
- **Tablet**: 768px (iPad portrait)
- **Desktop**: 1280px (standard laptop)

### Common Responsive Failures

| Issue | How to Detect | Severity |
|---|---|---|
| Horizontal scroll on mobile | Viewport meta missing or content overflows | HIGH |
| Touch targets too small | Buttons/links < 44px on mobile | MEDIUM |
| Hidden content | Important content in `display:none` on mobile with no alternative | HIGH |
| Unreadable text | Font too small on mobile (< 14px body text) | MEDIUM |
| Broken layout | Flex/grid items overlapping or stacking wrong | HIGH |
| Fixed-width elements | Tables, images, or containers with hardcoded px widths | MEDIUM |

```bash
# Check for viewport meta tag
grep -rn "viewport" --include="*.html" --include="*.tsx" --include="*.jsx" . \
  | grep -v node_modules | head -5

# Find fixed-width elements
grep -rn "width:\s*\d\{3,\}px" --include="*.css" --include="*.scss" --include="*.tsx" . \
  | grep -v "max-width\|min-width" | grep -v node_modules | head -10
```

---

## 5. Style Book Compliance (oc-app-architect projects)

If the project was designed through oc-app-architect Phase 3:

1. Read the style book (`design/style-book.html`) or design tokens
2. Compare actual implementations against defined tokens:
   - Colors: are all used colors in the palette?
   - Typography: are all font sizes in the type scale?
   - Spacing: are all margins/padding from the spacing scale?
   - Radii: are border-radius values from the defined scale?
3. Check punch list coverage:
   - Every screen in the punch list should have a corresponding page component
   - Every component in the punch list should exist with all listed states
   - Flag any screens/components that exist in code but NOT in the punch list (scope creep)

---

## UX Audit Scoring

| Category | Weight | What it measures |
|---|---|---|
| Accessibility | 30% | WCAG 2.1 AA compliance |
| State Coverage | 25% | Loading/empty/error/disabled handling |
| Design Consistency | 25% | Token usage, pattern uniformity |
| Responsive | 20% | Works at mobile/tablet/desktop |

### Grade Scale

| Grade | Score | Meaning |
|---|---|---|
| A | 90-100% | Ship-ready, minor polish only |
| B | 75-89% | Solid, a few gaps to address |
| C | 60-74% | Functional but notable UX debt |
| D | 40-59% | Significant issues affecting usability |
| F | < 40% | Major rework needed |
