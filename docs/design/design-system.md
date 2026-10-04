# Design system

The workspace gives long conversations a calm, scannable home. It keeps Fathom’s bright cyan cue for the next action, while the transcript and summaries stay quiet enough to read for an hour. The public [home](https://www.fathom.ai/), [pricing](https://www.fathom.ai/pricing), and [sales](https://www.fathom.ai/solutions/sales) pages were reviewed at 1440 and 390 pixels; screenshots are local in `docs/design/refs/`.

## Point of view

Use the marketing site’s black canvas, bright cyan action, light display type, and fine outlines as reference. The product UI uses charcoal surfaces instead of pure black, avoids the starfield and large gradients, and saves color for actions and six semantic highlight types. A meeting page needs the coherence of a working tool; its transcript, chapter links, and summary take priority over decoration (Tastemaker TS-011).

## System

| Element | Rule |
| --- | --- |
| Type | System sans. Display: 36/40 regular with tight tracking; page title: 30/36 regular; section: 18/28 medium; body: 16/24 regular; metadata: 14/20 or 12/16. Keep transcript text at 16px. |
| Spacing | 4px base; 8, 12, 16, 24, 32, 40, 56px steps. 16px page gutters on mobile, 24–32px on desktop. |
| Canvas | `bg #0e1013`; `surface #161a20`; `surface-2 #1e242c`; `border #2a313b`. Borders separate dense regions; whitespace separates sections. |
| Text | `fg #eef1f5`; `muted #98a2b3`; `accent #21baf3` with `accent-fg #06121f`; `danger #ff6b6b`. Cyan is reserved for primary actions, active navigation, and focused controls (CR-203). |
| Highlights | Action `#e5e7eb`, insight `#21baf3`, positive `#34d399`, feedback `#fbbf24`, objection `#f87171`, tech question `#a78bfa`. Use the color with a text label, never as the only cue. |
| Shape | Cards 12px radius, buttons 8px, chips full pill. One quiet 1px border; shadows only for floating overlays. |
| Motion | Fast 120ms for repeated control feedback; base 240ms ease-out for an entering panel; shimmer only while loading. No scroll reveal on transcript rows, lists, or every card. Reduced-motion users get effectively instant transitions (TS-004). |

The screenshots show a clear cyan call to action and strong type hierarchy. The pricing page’s yellow, orange, cyan, and violet columns work for plan comparison but would compete with transcript highlights in a dense workspace. The mobile marketing view gives the hero more space than a working screen can afford, so the app keeps compact controls and a readable transcript. Contrast is guarded in `tests/contrast.test.ts` against the six text/background pairs and six highlight colors (CR-201).
