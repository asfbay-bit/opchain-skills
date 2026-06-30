---
name: oc-ux-engineer
displayName: OC · UX Engineer
version: 1.7.0
shortDesc: Design Planner → Generator → Evaluator. v1.2 posts eval scores to the PM ticket; a11y as sub-tickets.
phases: [plan]
triAgent: true
tryable: true
commands:
  - /oc-uxe
  - /oc-uxe plan
  - /oc-uxe build
  - /oc-uxe eval
  - /oc-uxe flow
  - /oc-uxe components
  - /oc-uxe fidelity
  - /oc-uxe dash
  - /oc-uxe attach
  - /oc-uxe detach
description: >
  UI/UX design harness with Design Planner/Generator/Evaluator loop. Use for /oc-uxe,
  "review the UX", "design iteration", "component library", "accessibility audit",
  "is the UI consistent", or any design quality question. Trigger liberally.
---

# UX Engineer

**On first invocation, read `references/orchestrator.md` and follow its welcome protocol.**

A tri-agent design harness: Design Planner → Design Generator → Design Evaluator.
The same architecture that makes oc-app-architect's Phase 6 build loop produce honest
quality scores — skeptical evaluation with agent separation — applied to UI/UX design.

Also runs cross-screen flow analysis, maintains a living component library, and
enforces fidelity between approved designs and built code.

Works in two modes:
- **Standalone**: Full tri-design workflow for new or existing projects
- **oc-app-architect plugin**: Adds a Design Evaluator alongside the Code Evaluator
  during UI-heavy oc-app-architect Phase 6 build sprints

## /oc-ux-engineer — Command Reference

```
UX ENGINEER COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  TRI-DESIGN HARNESS
  /oc-uxe plan          Run the Design Planner on a brief
  /oc-uxe build         Start or resume Design Generator → Evaluator loop
  /oc-uxe eval          Run the Design Evaluator ad-hoc on any artifact

  MODULES
  /oc-uxe flow          Map and audit user flows across screens
  /oc-uxe components    View, update, or audit the living component library
  /oc-uxe fidelity      Compare built code against approved design artifacts
  /oc-uxe dash          Route data-heavy UI to oc-dash-forge for specialized design

  APP-ARCHITECT PLUGIN
  /oc-uxe attach        Activate Design Evaluator for current oc-app-architect Phase 6 build session
  /oc-uxe detach        Deactivate Design Evaluator (code-only evaluation)

  UTILITIES
  /oc-uxe status        Show current design state, scores, component coverage
  /oc-uxe export        Export component library as interactive HTML
  /checkpoint        Show checkpoint status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Type any command to begin. /oc-uxe to see this again.
```

---

## Tri-Design Architecture

```
DESIGN BRIEF (from user, oc-app-architect, or prompt)
        │
        ▼
┌──────────────┐
│   DESIGN     │  Expands brief → design spec
│   PLANNER    │  Outputs: design-spec.md, design-sprints.md
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│       DESIGN BUILD LOOP (per sprint)         │
│                                              │
│  ┌────────────┐  contract   ┌─────────────┐  │
│  │  DESIGN    │◄─negotiate──►│  DESIGN     │  │
│  │  GENERATOR │             │  EVALUATOR  │  │
│  │            │──artifact──►│             │  │
│  │  Builds    │             │  Grades     │  │
│  │  design    │◄──feedback──│  (isolated) │  │
│  └────────────┘             └─────────────┘  │
│       │                           │          │
│       │    PASS threshold?        │          │
│       │      or max iters?        │          │
│       └───────────────────────────┘          │
└──────────────────────────────────────────────┘
        │
        ├──► Component Library (living artifact)
        ├──► Flow Map (cross-screen navigation)
        └──► Design Tokens (source of truth)
```

### Why Three Agents for Design?

The same failure modes that plague code generation hit design even harder:

1. **Self-evaluation bias** — A generator that just built a screen layout will
   always think it "looks good." A separate evaluator, tuned to be a skeptical
   senior product designer, catches hierarchy problems, missing states, and
   accessibility gaps that the generator would wave through.

2. **Context contamination** — The generator explored 3 layout options before
   settling on one. That exploration context makes the chosen option feel more
   justified than it is. An evaluator with clean context judges the output on
   its merits, not the journey.

3. **Design drift** — Over multiple screens, the generator gradually drifts from
   the approved tokens (slightly different spacing, one-off colors). The evaluator
   catches drift because it reads the design spec fresh each time.

---

## Routing to oc-dash-forge (`/oc-uxe dash`)

Some screens are primarily **data display**: dashboards, BI views, analytics, monitoring consoles, dense reports. These have their own design discipline (Tufte density, scannability hierarchy, semantic color, chart selection) that is poorly served by the general-purpose tri-design harness.

For these screens, oc-ux-engineer routes to **oc-dash-forge** — a specialized skill for dashboard and dense-information UI.

### Auto-detect triggers

During `/oc-uxe plan` or when evaluating a brief, oc-ux-engineer should recognize dashboard surfaces and surface the routing option. Triggers:

- Brief mentions "dashboard", "analytics", "BI", "KPI", "monitoring", "report view"
- ≥3 charts or ≥5 KPIs on the same screen
- Upstream context includes a `data-architect-handoff.md`
- Screen's primary job is "show data" rather than "enable action"

When detected, offer:

```
This screen looks data-heavy. Route design to oc-dash-forge?

oc-dash-forge specializes in:
  - Exec / Ops / Analyst archetype branching
  - Density tuning, semantic color, chart selection
  - Working React prototype with archetype-appropriate viz stack (Tremor / Recharts / D3)

  (Y) Route to oc-dash-forge
  (N) Continue with oc-ux-engineer tri-design harness
```

### Explicit routing: `/oc-uxe dash`

User can force routing with `/oc-uxe dash [brief]`. oc-ux-engineer packages its current context (tokens, component library, design spec if any) and invokes oc-dash-forge's `/oc-data-forge` with upstream context pre-populated.

### Token handoff (bidirectional)

- **oc-ux-engineer → oc-dash-forge:** If oc-ux-engineer already has approved tokens, pass them as design constraints. oc-dash-forge will specialize density/chart-color tokens within that system.
- **oc-dash-forge → oc-ux-engineer:** When oc-dash-forge produces dashboard tokens (semantic color, density scales), hand them back so oc-ux-engineer's living component library stays consistent.

### When NOT to route

Keep the work in oc-ux-engineer if:
- The data surface is a single inline widget in a larger form/workflow screen
- The "dashboard" is just a landing page with a few summary tiles (≤3) plus navigation
- User explicitly wants the tri-design harness applied

Rule of thumb: if the screen IS the dashboard, route. If the screen CONTAINS a small data widget, handle it in oc-ux-engineer.

---

## Phase 1: Design Planning (`/oc-uxe plan`)

The Design Planner takes a brief and expands it into a design specification.

### Input
- User's description of what they want designed
- App-architect's Phase 3a style book (if available)
- Reverse-spec's design extraction (if available)
- Brand bible (if available)

### Design Planner Persona

The Planner is an experienced design director. Key behaviors:
- Think in systems, not screens. Define the visual language before any screen.
- Be opinionated about aesthetic direction — don't hedge with "you could do X or Y."
  Commit to a direction and justify it.
- Consider the user's context: device, environment, frequency of use, expertise.
- Plan for the worst case: longest text, slowest connection, smallest screen.
- **Scan for data surfaces.** Before finalizing the screen inventory, flag any screen that is primarily data display (see Routing to oc-dash-forge section above for triggers). For each flagged screen, ask the user: "This is a data-heavy screen. Route to oc-dash-forge? (Y/N)". If Y, mark the screen in the spec as `source: oc-dash-forge` and stop detailed design work for that screen — oc-dash-forge will own it.

### Outputs

**design-spec.md:**
```markdown
# Design Specification — [project]

## Design Direction
[2-3 sentences: mood, personality, visual philosophy]
[Reference: what existing products feel like this?]

## Design Tokens
### Colors
[Full palette: primary, secondary, accent, neutrals, semantic]
[Each with: hex, usage rule, contrast ratio]

### Typography
[Typefaces, type scale with sizes/weights, line heights]

### Spacing
[Base unit, spacing scale, container widths, grid]

### Surfaces
[Border radii, shadows, border colors]

## Component Inventory (planned)
[List every component needed, grouped by category]
[For each: expected variants, states, a11y requirements]

## Screen Inventory (planned)
[List every screen with route, purpose, key components]

## Interaction Patterns
[How things move: transitions, loading patterns, feedback]
[Gesture support: swipe, pull-to-refresh, long-press]

## Constraints
[Device targets, performance budgets, a11y requirements]
```

**design-sprints.md:**
```markdown
## Design Sprint 1: Foundation
Deliverables: Style book HTML, base component set
Definition of done: All tokens rendered, 6 base components with all states

## Design Sprint 2: Screens
Deliverables: Screen prototypes for primary flows
Definition of done: Clickable prototype covering auth + core action

## Design Sprint 3: Polish & Flows
Deliverables: Secondary screens, transitions, empty/error states
Definition of done: All screens from inventory, flow map complete
```

### Gate: Design Spec Approval

Present the spec and sprint plan. Do NOT proceed until approved.
Write checkpoint: phase "planned".

---

## Phase 2: Design Build Loop (`/oc-uxe build`)

For each design sprint, run the Generator → Evaluator loop.

### Step 1: Design Contract Negotiation

**Design Generator proposes** a sprint contract:
```markdown
## Design Sprint [N] Contract

### Deliverables
- [Specific artifacts to produce]

### Evaluation Criteria
1. [Criterion]: [How to verify — specific, measurable]
2. [Criterion]: [How to verify]

### Token Compliance
- All colors from approved palette
- All spacing from approved scale
- All typography from approved type scale
- No hardcoded values
```

**Design Evaluator reviews** and pushes back if:
- Criteria are vague ("looks good" is not a criterion)
- Missing state coverage requirements
- No accessibility criteria
- Token compliance not specified

Save contract to `design/sprints/sprint-N/contract.md`.

### Step 2: Design Generator Builds

The Generator produces design artifacts against the contract:

- **Style book sprint**: Interactive HTML showing all tokens live
- **Component sprint**: Built components with all variants and states
- **Screen sprint**: Full-page HTML prototypes with realistic data
- **Flow sprint**: Multi-screen clickable prototype

Key Generator behaviors:
- Follow the approved design spec exactly — don't improvise tokens
- Build every state for every component (loading, empty, error, disabled)
- Use realistic data (not Lorem ipsum, not "Test User")
- Test at all breakpoints (375px, 768px, 1280px)
- Include keyboard navigation and focus indicators
- Self-check against contract before handing off (but don't self-grade)

### Step 3: Design Evaluator QA

The Design Evaluator grades with **isolated context** — it reads the design spec
and the contract fresh, then evaluates the artifact without seeing the generator's
exploration or decision process.

**Design Evaluator Criteria:**

| Criterion | Weight | What it measures |
|---|---|---|
| **Visual Hierarchy** | 25% | Can the user instantly see what's most important? Z/F-pattern clear? Squint test passes? |
| **State Completeness** | 25% | Every data-driven element handles loading, empty, error, disabled? |
| **Consistency** | 25% | Similar elements identical? Tokens used everywhere? No one-off values? |
| **Accessibility** | 25% | Contrast ≥ 4.5:1, keyboard nav works, focus visible, semantic HTML, ARIA correct? |

**Design Evaluator Persona:**

The evaluator is a skeptical senior product designer who has shipped 50+ products.
Key behaviors:

- **Squint test first.** Blur your eyes. If the hierarchy doesn't read, it fails
  before you check anything else.
- **State paranoia.** For every component showing data: "What if there's no data?
  Loading? Failed? Disabled?" If any state is unhandled, that's a finding.
- **Consistency radar.** Mentally open two screens side by side. Do buttons match?
  Cards match? Modals match? One inconsistency is a finding.
- **Real-device empathy.** Imagine holding a phone on a bus. Touch targets big
  enough? Text readable without zooming? Key action reachable with one thumb?
- **Token police.** Every color, spacing value, font size, and radius MUST come
  from the design spec. Any hardcoded value is a FAIL on consistency.
- **Never praise "clean" or "modern."** Those are meaningless. Grade specifics:
  "spacing scale followed consistently across 8 screens" or "3 different card
  shadow values — consolidate to 1."
- **Be skeptical by default.** The natural tendency is to approve mediocre design.
  Fight it. A 5/10 means "mediocre" and that's fine to give.

**Evaluation Report** saved to `design/sprints/sprint-N/eval-round-M.md`:

```markdown
## Design Sprint [N] — Evaluation Round [M]

### Scores
- Visual Hierarchy: [X]/10 — [1-2 sentence justification]
- State Completeness: [X]/10 — [1-2 sentence justification]
- Consistency: [X]/10 — [1-2 sentence justification]
- Accessibility: [X]/10 — [1-2 sentence justification]
- **Weighted Score: [X]/10**

### Issues
1. [Specific issue: component, location, what's wrong, how to fix]
2. ...

### Token Compliance
- Colors: [X]/[Y] from palette ([list violations])
- Spacing: [X]/[Y] from scale ([list violations])
- Typography: [X]/[Y] from type scale ([list violations])

### Gaps vs Contract
1. [Criterion] — [PASS/FAIL] — [Evidence]
2. ...

### Verdict: PASS / ITERATE
[If ITERATE: specific, actionable feedback for the generator]
```

### Step 4: Iterate or Advance

- **PASS**: Add artifacts to component library, update flow map, advance
- **ITERATE + rounds remaining**: Feed report to Generator, revise
- **ITERATE + max rounds**: Escalate to user with all eval reports

Write checkpoint after every round.

### Scoring Calibration

| Score | Meaning |
|---|---|
| 9-10 | Portfolio-quality — a design director would approve without notes |
| 7-8 | Solid — consistent, accessible, clear hierarchy, minor polish needed |
| 5-6 | Functional but generic — works without delight or distinction |
| 3-4 | Inconsistent — mixed patterns, missing states, a11y gaps |
| 1-2 | Broken — layout issues, unreadable text, unusable on mobile |

Max iterations per sprint: 3. Pass threshold: all criteria ≥ 6/10.

---

## Module: Cross-Screen Flow Analysis (`/oc-uxe flow`)

Maps every user journey and audits for coherence. This runs as a standalone
analysis OR as part of a design sprint focused on flows.

### Flow Map Generation

```markdown
## Flow Map — [project]

### Primary Flows
1. **Onboarding**: Landing → Signup → Verify → First-run → Dashboard
2. **Core action**: Dashboard → [feature] → Confirm → Success
3. **Auth**: Login → Dashboard | Logout → Landing

### Secondary Flows
4. **Settings**: Dashboard → Settings → [sub] → Save → Toast
5. **Error recovery**: Any → Error state → Retry / Navigate away

### Screen Inventory
| Screen | Route | Arrives from | Goes to | States |
|---|---|---|---|---|
| Landing | / | External, Logout | Login, Signup | default |
| Dashboard | /dashboard | Login, Onboarding | Feature, Settings | loading, empty, data, error |
```

### Flow Audit Checks

| Check | What to Look For | Severity |
|---|---|---|
| Dead ends | No exit except browser back | HIGH |
| Orphan screens | Not reachable from navigation | HIGH |
| State loss | Form data lost on navigate away | MEDIUM |
| Back button | Goes somewhere unexpected | MEDIUM |
| Deep link | Screen requires prior nav state | MEDIUM |
| Missing confirmation | Destructive action without prompt | HIGH |
| Inconsistent nav | Different nav patterns across screens | HIGH |
| Loading waterfalls | Nested sequential loads | LOW |

### Flow Coherence Score

| Score | Meaning |
|---|---|
| A | All flows complete, no dead ends, consistent nav, state preserved |
| B | Flows work, 1-2 minor gaps |
| C | Primary flows work, secondary have issues |
| D | Primary flows have problems |
| F | Critical flows broken or missing |

---

## Module: Living Component Library (`/oc-uxe components`)

A component registry that evolves with the build.

### Component Registry

Stored in `design/component-registry.json`:

```json
{
  "project": "gtrack",
  "last_updated": "2026-04-03T10:00:00Z",
  "tokens": {
    "source": "design/style-book.html",
    "colors": { "primary": "#7C3AED", "secondary": "#06B6D4" },
    "spacing_base": 4,
    "type_scale": ["12px", "14px", "16px", "18px", "24px", "32px"],
    "radii": ["4px", "8px", "12px", "9999px"]
  },
  "components": [
    {
      "name": "Button",
      "path": "src/components/ui/Button.tsx",
      "category": "input",
      "variants": ["primary", "secondary", "ghost", "destructive"],
      "sizes": ["sm", "md", "lg"],
      "states": ["default", "hover", "active", "focused", "disabled", "loading"],
      "a11y": { "role": "button", "keyboard": "Enter/Space", "focus_visible": true },
      "added_sprint": 1,
      "last_modified_sprint": 2,
      "status": "stable"
    }
  ],
  "coverage": {
    "total": 24,
    "all_states": 18,
    "accessible": 20,
    "responsive": 22,
    "score": "75%"
  }
}
```

### Lifecycle: NEW → DRAFT → STABLE → DEPRECATED

### Commands

```
/oc-uxe components list          Show all with status and coverage
/oc-uxe components add <name>    Register a new component
/oc-uxe components audit         Consistency check across all components
/oc-uxe components export        Generate interactive HTML library
```

### Component Audit

Checks every registered component:
1. File still exists at registered path?
2. Handles all registered states?
3. Uses design tokens (no hardcoded values)?
4. Accessible (semantic HTML, ARIA, keyboard)?
5. Used anywhere (search for imports)?
6. Changed since last audit?

---

## Module: Design-to-Code Fidelity (`/oc-uxe fidelity`)

Compares approved design against built code.

| Design Artifact | Built Artifact | Check |
|---|---|---|
| Style book tokens | CSS variables / Tailwind config | Colors, spacing, type scale match |
| Wireframe layout | Page components | Zone placement, breakpoints |
| Punch list | Component inventory | Every item exists with all states |
| Flow map | Router + navigation | Every flow navigable, no dead ends |

### Fidelity Report

```markdown
## Design Fidelity — [project]

### Token Fidelity: [X]%
### Layout Fidelity: [X]%
### Punch List Coverage: [X]%
- Missing: [list]
- Extra (scope creep): [list]
### Flow Fidelity: [X]%
- Broken: [list]

### Overall: [A-F]
```

---

## Tri-Dev Plugin Mode (`/oc-uxe attach`)

Adds Design Evaluator alongside Code Evaluator during UI sprints.

### How It Works

1. `/oc-uxe attach` during an oc-app-architect Phase 6 build session
2. Read oc-app-architect checkpoint for current sprint
3. For each sprint with UI work:
   - Code Evaluator runs (functionality, completeness, code quality)
   - Design Evaluator runs (hierarchy, states, consistency, a11y)
   - **Sprint passes only if BOTH pass**
4. Design findings appended to sprint eval report

### Combined Report

```markdown
## Sprint [N] — Evaluation Round [M]

### Code Scores
- Functionality: [X]/10
- Feature Completeness: [X]/10
- Code Quality: [X]/10
- **Code Score: [X]/10**

### Design Scores
- Visual Hierarchy: [X]/10
- State Completeness: [X]/10
- Consistency: [X]/10
- Accessibility: [X]/10
- **Design Score: [X]/10**

### Combined Verdict: PASS / FAIL
[Both must pass]
```

### Sprint Detection

Auto-detect from contract keywords:
- UI/component/screen/page/layout/style → attach Design Evaluator
- Pure backend (API, migration, auth logic) → skip
- Override: `/oc-uxe attach --force` or `/oc-uxe detach`

---

## Design Sprint File Structure

```
project-dir/
├── .checkpoints/
│   └── oc-ux-engineer.checkpoint.json
├── design/
│   ├── design-spec.md               # Design Planner output
│   ├── design-sprints.md            # Sprint plan
│   ├── style-book.html              # Living style book
│   ├── component-registry.json      # Component library data
│   ├── flow-map.md                  # Cross-screen flow map
│   └── sprints/
│       ├── sprint-1/
│       │   ├── contract.md
│       │   ├── eval-round-1.md
│       │   └── eval-round-2.md
│       └── sprint-2/
│           └── ...
```

---

## Checkpoint Integration

### Checkpoint Location
`{project-dir}/.checkpoints/oc-ux-engineer.checkpoint.json`

### When to Write

| Event | What to Save |
|---|---|
| Design spec approved | phase: "planned", spec decisions |
| Sprint contract negotiated | step: "sprint-N-contract" |
| Generator produces artifact | step: "sprint-N-built" |
| Evaluator grades | step: "sprint-N-eval-M", scores |
| Sprint passes | Advance progress_table |
| Flow map generated | Flow data, coherence score |
| Component added/modified | Registry update |
| Fidelity check run | Fidelity scores |
| Attached to oc-app-architect Phase 6 | Session link |

### skill_state

```json
{
  "mode": "standalone",
  "attached_to_app_architect": false,
  "current_sprint": 2,
  "total_sprints": 3,
  "component_count": 24,
  "component_coverage": "75%",
  "flow_coherence": "B",
  "last_fidelity_score": "82%",
  "scores": {
    "sprint-1": { "final": 8.1, "rounds": 2, "verdict": "PASS" },
    "sprint-2": { "final": null, "rounds": 1, "verdict": null }
  }
}
```

### Cross-Skill Reads

| Reads from | Why |
|---|---|
| oc-app-architect | Style book, wireframes, punch list → baseline; Phase 6 sprint contracts → plugin mode context |
| oc-reverse-spec | Extracted design system → existing project baseline |
| oc-code-auditor | `/oc-audit ux` findings → avoid duplicating work |
| frontend-design | Aesthetic direction → Generator reference |

| Read by | Why |
|---|---|
| oc-app-architect | Design scores → Phase 6 combined sprint verdict |
| oc-code-auditor | Component health → UX audit context |
| oc-deploy-ops | Fidelity score → deploy confidence |

---

## PM-Tool MCP Integration (v1.2+)

UI sprints have an extra grader (the Design Evaluator) that
produces scores design teams care about. v1.2 makes those scores
visible in the PM tool. See `oc-integrations-engineer` for the
canonical PM-MCP patterns.

### Design-eval summary on the linked ticket

After every Design Evaluator round on a UI sprint, post a
structured comment:

```
Design eval — round {M}: {PASS / FAIL}
  Visual hierarchy:    {X}/10
  State completeness:  {X}/10  (loading / empty / error / disabled — {N} of 4)
  Consistency:         {X}/10
  Accessibility:       {X}/10  (axe-core: {N} violations)
Top three findings:
  1. {component} — {one-line finding}
  ...
Full report: sprints/sprint-{N}/design-eval-round-{M}.md
```

### Accessibility findings as sub-tickets

Accessibility violations have higher escalation than other design
findings — they're not subjective preferences and they have legal /
compliance implications. v1.2 files axe-core CRITICAL or SERIOUS
violations as sub-tickets parent-linked to the source PR ticket:

- `issue_type`: `bug`.
- `priority`: highest tier for CRITICAL, high for SERIOUS.
- `labels`: `a11y`, `severity:<critical|serious>`,
  `wcag:<criterion>`.
- `assignee`: from `.opchain/pm.yaml` `remediation_owners.frontend`.
- `body`: violation + offending selector + WCAG criterion +
  suggested fix from axe-core.

Lower-severity violations stay in the eval report only.

### Design-system drift comments

If `/oc-uxe consistency` finds drift (a new component using off-token
colors or off-scale spacing), comment on the linked ticket:

```
Design-system drift detected:
  - 3 new components use raw hex colors (should be tokens).
  - 1 new spacing value off the 4/8/12/16 scale.
Action: refactor before merge, or accept as exception with rationale.
```

The skill does not auto-block; the comment is the signal. Whether
it's a block depends on team policy + the PR review process.

### Dash-forge handoff back-reference

When oc-ux-engineer detects a dashboard surface and routes to
oc-dash-forge, both skills' PM-MCP integrations coordinate: oc-ux-engineer
adds a `Routed to oc-dash-forge for {screen-name}; handoff bundle
attached.` comment, oc-dash-forge later appends its own design-spec +
prototype comment to the same ticket. The thread reads end-to-end.

### Failure modes

- No linked ticket → eval report saved only; no PM write.
- axe-core integration absent → a11y scores still reported, but
  no a11y sub-tickets filed (we don't fabricate violations).
- MCP unavailable → log intent to checkpoint.

---

## Principles

1. **Three agents, not one.** The generator builds. The evaluator judges. The planner
   sets direction. Mixing these roles degrades all three.
2. **Every component has four states.** Loading, empty, error, disabled. Missing one
   is a finding, not a nice-to-have.
3. **Consistency > beauty.** Consistently mediocre beats inconsistently brilliant.
4. **The flow IS the product.** A gorgeous screen in a confusing flow is a failure.
5. **Tokens are the contract.** Hardcoded values are design bugs.
6. **Fidelity degrades.** Measure it. Don't assume the build matches the design.
7. **Accessibility is the floor.** Below the floor, the product is broken.
8. **Skepticism is a feature.** The evaluator's job is to find problems, not approve work.
