# WCAG 2.2 AA internal audit

Status: internal audit complete. This is not third-party certification.

Praxbit targets WCAG 2.2 Level AA for the web application, PWA, and Capacitor shell. The audit covers the implemented routes and interactive states in Chromium, Firefox, and WebKit at desktop, tablet, and mobile viewports.

## Audit method

- Automated axe scans on every primary route and on interactive mission, project, world, settings, placement, club, and not-found states. The scan uses the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` tags with no disabled rules.
- Keyboard-only traversal of every route, tab list, editor, form, ordering interaction, world selector, and mission step.
- Focus-management checks for route changes, mission step changes, completion, placement results, project stages, and dialogs.
- Browser zoom at 200 percent, 320 CSS pixel reflow, 1.4 in-app text scale, WCAG text-spacing overrides, Windows forced-colors emulation, and reduced-motion emulation.
- Contrast measurements for text, controls, borders, focus rings, and status marks.
- Target-size measurements against WCAG 2.2 AA (24 by 24 CSS pixels) and the project standard (44 by 44 CSS pixels).
- Accessibility-tree review of names, roles, states, landmarks, headings, tables, tabs, live regions, and the canvas alternative.
- Manual review of the source for sensory-only instructions, timing, motion, audio, video, authentication, and redundant-entry risks.

The automated and manual evidence is in `tests/browser/wcag22.spec.ts`, `tests/browser/a11y.spec.ts`, `tests/browser/a11y-surfaces.spec.ts`, and `tests/browser/keyboard.spec.ts`. Run it with `pnpm test:wcag`.

## Criterion results

| Criterion | Level | Result | Evidence |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Pass | Decorative Pixi canvas is hidden; meaningful controls have names; Pip is decorative where it carries no information. Axe and accessibility-tree review. |
| 1.2.1 Audio-only and Video-only | A | Not applicable | No pre-recorded audio-only or video-only content. |
| 1.2.2 Captions (Prerecorded) | A | Not applicable | No prerecorded video with audio. |
| 1.2.3 Audio Description or Media Alternative | A | Not applicable | No prerecorded video. |
| 1.2.4 Captions (Live) | AA | Not applicable | No live audio or video. |
| 1.2.5 Audio Description (Prerecorded) | AA | Not applicable | No prerecorded video. |
| 1.3.1 Info and Relationships | A | Pass | One main landmark, ordered headings, semantic tables, tab semantics, labeled forms. Axe route and interactive scans. |
| 1.3.2 Meaningful Sequence | A | Pass | DOM order follows visual order; route and step focus tests. |
| 1.3.3 Sensory Characteristics | A | Pass | Instructions name the control and the concept, not only shape, color, or position. Content validator and manual review. |
| 1.3.4 Orientation | AA | Pass | Responsive layout supports portrait and landscape; no orientation lock. |
| 1.3.5 Identify Input Purpose | AA | Pass | Forms collect handle, display name, password, search, and club text only; no personal-purpose autofill fields are requested. |
| 1.4.1 Use of Color | A | Pass | Status always includes a word and mark; focus and errors use multiple cues. |
| 1.4.2 Audio Control | A | Not applicable | No auto-playing audio. |
| 1.4.3 Contrast (Minimum) | AA | Pass | Text contrast test covers primary and muted text; axe color-contrast. |
| 1.4.4 Resize Text | AA | Pass | 1.4 text scale and 200 percent browser zoom tests; no clipping. |
| 1.4.5 Images of Text | AA | Pass | No images of text; typography is live text. |
| 1.4.10 Reflow | AA | Pass | 320 CSS pixel reflow test; no horizontal scrolling. |
| 1.4.11 Non-text Contrast | AA | Pass | Control, border, focus, status-mark, and forced-colors checks. |
| 1.4.12 Text Spacing | AA | Pass | Text-spacing override test; no clipping or horizontal scrolling. |
| 1.4.13 Content on Hover or Focus | AA | Not applicable | No hover-only tooltip or popover content. |
| 2.1.1 Keyboard | A | Pass | Every control is keyboard operable; editor Tab exit, tab arrows, ordering buttons, and world list tests. |
| 2.1.2 No Keyboard Trap | A | Pass | CodeMirror Tab exit test; dialogs restore focus; no trap outside deliberate modals. |
| 2.1.4 Character Key Shortcuts | A | Pass | Shortcuts use modifiers; no single-character global shortcut. |
| 2.2.1 Timing Adjustable | A | Pass | No time limit on learning activities. |
| 2.2.2 Pause, Stop, Hide | A | Pass | No endless background animation; reduced-motion test. |
| 2.3.1 Three Flashes or Below Threshold | A | Pass | No flashing content; reduced-motion and source review. |
| 2.4.1 Bypass Blocks | A | Pass | Skip link is first, visible on focus, and targets `#main`. |
| 2.4.2 Page Titled | A | Pass | Every audited route sets a unique title ending in `Praxbit`. |
| 2.4.3 Focus Order | A | Pass | Visual order, route focus, step focus, project stage focus, and placement result focus tests. |
| 2.4.4 Link Purpose (In Context) | A | Pass | Links have descriptive text; icon-only controls have names. |
| 2.4.5 Multiple Ways | AA | Pass | Learn map, search, direct routes, practice, and recommendations provide multiple paths. |
| 2.4.6 Headings and Labels | AA | Pass | Heading hierarchy and form labels checked by axe and structure tests. |
| 2.4.7 Focus Visible | AA | Pass | Focus ring visible in light, dark, and forced-colors modes; editor focus ring restored. |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Pass | No sticky overlay covers focused controls; manual review and focus tests. |
| 2.5.1 Pointer Gestures | A | Pass | No multipoint or path-based gesture is required. |
| 2.5.2 Pointer Cancellation | A | Pass | Actions trigger on click/activation, not pointer-down. |
| 2.5.3 Label in Name | A | Pass | Visible labels match accessible names on forms and controls. |
| 2.5.4 Motion Actuation | A | Pass | No device-motion action. |
| 2.5.7 Dragging Movements | AA | Pass | Ordering has move-up/move-down buttons; no drag-only task. |
| 2.5.8 Target Size (Minimum) | AA | Pass | 24px WCAG and 44px project target-size test. |
| 3.1.1 Language of Page | A | Pass | Root document declares `lang="en"`. |
| 3.1.2 Language of Parts | AA | Pass | Interface copy is English; code and quoted syntax are labeled as code. |
| 3.2.1 On Focus | A | Pass | Focus does not submit or navigate unexpectedly. |
| 3.2.2 On Input | A | Pass | Inputs do not change context without an explicit action. |
| 3.2.3 Consistent Navigation | AA | Pass | Five primary destinations remain in the same order on every route. |
| 3.2.4 Consistent Identification | AA | Pass | Repeated controls use consistent names and roles. |
| 3.2.6 Consistent Help | A | Pass | Hints and settings help remain in the same location and order. |
| 3.3.1 Error Identification | A | Pass | Form errors are text, associated with fields, and announced. |
| 3.3.2 Labels or Instructions | A | Pass | Visible labels and instructions; no placeholder-only labels. |
| 3.3.3 Error Suggestion | AA | Pass | Field errors state what to correct, including handle, password, and settings validation. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Pass | Account deletion requires typed confirmation; project and world changes are reversible or explicitly confirmed. |
| 3.3.7 Redundant Entry | A | Pass | Forms do not ask for the same information twice. |
| 3.3.8 Accessible Authentication (Minimum) | AA | Pass | Password paste and password managers are allowed; no cognitive puzzle. |
| 4.1.2 Name, Role, Value | A | Pass | Axe interactive-state scan; tabs, dialogs, status, and form controls expose state. |
| 4.1.3 Status Messages | AA | Pass | Polite status regions announce route changes, saves, mission results, world changes, and ordering. |

## Assistive-technology notes

- Keyboard and browser accessibility-tree behavior is verified in all three browser engines.
- Live-region announcements are asserted for route changes, preference saves, mission feedback, test results, and runtime errors.
- The world canvas is not the only representation; the system list is the complete keyboard control set.
- The code editor exposes a named region, a visible focus ring, a Tab exit, and a documented run shortcut.
- Math, syntax, and code content is text, not an image.
- A vendor screen-reader speech matrix (NVDA, JAWS, VoiceOver, TalkBack) and third-party certification are outside this internal audit. The project does not claim them.

## Known external boundaries

- Native Android and iOS accessibility requires device testing with TalkBack and VoiceOver.
- Formal WCAG certification requires an independent auditor.
- Cognitive-load and dyslexia review with representative learners requires human research.
- Audio versions, sign-language versions, and captions are not applicable because the product has no prerecorded media.
