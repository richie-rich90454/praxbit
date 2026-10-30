# WCAG 2.2 AA Internal Audit

**Status:** Internal audit evidence, not third-party certification.

**Product:** Praxbit web application (`apps/web`)

**Date:** October 30, 2026

**Standard:** WCAG 2.2, Level A and Level AA

This report records what Praxbit's automated and code-inspection evidence supports. It is not a conformance claim, a legal opinion, or a substitute for review by people with disabilities using their own assistive technology. A pass below means no failure was found by the named evidence within the audited scope.

## Scope

Audited routes:

- `/learn`
- `/world`
- `/practice`
- `/projects`
- `/projects/projects.campus-status-board`
- `/club` (signed-out gate)
- `/settings`
- `/placement`
- `/missions/before-code.make-it-respond` (briefing, steps, feedback, completion)
- `/missions/campus.the-button-does-nothing` (code tabs)
- `/this-page-does-not-exist`

The root `/` redirect to the opening mission was also checked for its final title.

Out of scope: native Android and iOS shells, screen-reader output on real devices, browser extensions, the PixiJS canvas as a sole information source, email or notification content, and third-party provider interfaces.

## Method

Automated checks:

- Axe 4.14.0 through `@axe-core/playwright`, with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.
- Playwright 1.64.1 across the repository's five project profiles: `desktop`, `tablet`, `mobile`, `firefox`, and `webkit`.
- Custom browser checks for 200% zoom, 320 CSS pixel reflow, text-spacing overrides, 1.4 text scale, forced colors, target size, non-text contrast, route titles, focus movement, live regions, tab keyboard behavior, skip link, reduced motion, horizontal overflow, and per-route structure.

Manual/code inspection:

- Landmark, heading, form, table, ARIA, and keyboard behavior in `apps/web/src`.
- Focus, forced-colors, reduced-motion, and target-size rules in `apps/web/src/styles/global.css` and `tokens.css`.
- Absence of media, drag-only interactions, autoplay audio, and hover-only content.

Axe does not publish a `wcag22a` tag. The new Level A criteria 3.2.6 and 3.3.7 are therefore covered by code inspection, not by an axe tag. Axe is a baseline and does not detect every keyboard, focus, reading-order, or screen-reader problem.

## Results

| Result                        | Count |
| ----------------------------- | ----: |
| Pass                          |    52 |
| Partial                       |     3 |
| Fail                          |     0 |
| Total Level A and AA criteria |    55 |

Automated suite results:

- `tests/browser/wcag22.spec.ts`: 85/85 passed (17 tests across 5 projects).
- `tests/browser/a11y.spec.ts` and `tests/browser/a11y-surfaces.spec.ts`: 95/95 passed (19 tests across 5 projects).
- `scripts/wcag-report.mjs` produced the criterion table from Playwright JSON and exited successfully for the desktop project. The script states that it is not certification.

## Criterion evidence

| Criterion | Level | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Pass | Axe route/state checks; `Pip.tsx:23-24`; `Logo.tsx:6`; `WorldScreen.tsx:252-260` | Decorative mascot and logo SVGs are hidden from assistive technology. The world canvas is `aria-hidden`; the accessible system list carries the state. No content images of text were found. |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Pass | Code inspection | Not applicable: the web application contains no audio-only or video-only media. |
| 1.2.2 Captions (Prerecorded) | A | Pass | Code inspection | Not applicable: no prerecorded video is present. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Pass | Code inspection | Not applicable: no prerecorded video is present. |
| 1.2.4 Captions (Live) | AA | Pass | Code inspection | Not applicable: no live audio or video is present. |
| 1.2.5 Audio Description (Prerecorded) | AA | Pass | Code inspection | Not applicable: no prerecorded video is present. |
| 1.3.1 Info and Relationships | A | Pass | `wcag22.spec.ts` page-structure test; axe route/state checks; `AppShell.tsx:131-235` | One `main`, one `h1`, primary navigation, header, and footer are present on every audited route. Tables use captions and header cells. Forms use `label`, `fieldset`, and `legend`. |
| 1.3.2 Meaningful Sequence | A | Pass | Code inspection; `wcag22.spec.ts` page-structure test | DOM order follows the visible reading order. No CSS `order` or absolute positioning is used to reorder primary content. |
| 1.3.3 Sensory Characteristics | A | Pass | Code inspection; `WorldScreen.tsx:281-292`; `SettingsScreen.tsx:323-337` | Status is a word plus a shape, not color alone. Instructions name controls and fields rather than relying on shape or position. |
| 1.3.4 Orientation | AA | Pass | `wcag22.spec.ts` 320px and 200% zoom tests | No orientation lock or orientation-specific restriction was found. The layout reflows in portrait and wide viewports. |
| 1.3.5 Identify Input Purpose | AA | Pass | `SettingsScreen.tsx:303-363` | Handle and password inputs declare `autocomplete="username"`, `current-password`, or `new-password`. Other inputs do not collect personal data. |
| 1.4.1 Use of Color | A | Pass | `wcag22.spec.ts` contrast test; `WorldScreen.tsx:281-292`; `SettingsScreen.tsx:327-337` | Status text accompanies every status mark. Errors use text and `role="alert"`, not color alone. Links remain underlined. |
| 1.4.2 Audio Control | A | Pass | Code inspection; `learning-store.tsx` sound preference | Not applicable: no audio plays automatically. The optional completion tone is off by default and requires an explicit preference. |
| 1.4.3 Contrast (Minimum) | AA | Pass | `wcag22.spec.ts` text and non-text contrast test; axe route/state checks | Body, meta, link, button, success, and warning samples met their thresholds. Axe found no text-contrast violations on the audited routes and states. |
| 1.4.4 Resize Text | AA | Pass | `wcag22.spec.ts` 200% zoom and 1.4 text-scale tests; `a11y.spec.ts` zoom/text-scale test | 200% zoom equivalent (720 CSS pixels at a 1440-pixel desktop width) and the in-app maximum both avoid horizontal scrolling and clipped prose. Note: `learning-store.tsx:324-331` maps the 0.9-1.4 control to small, normal, and large token buckets; the 1.4 setting is not a continuous 1.4 multiplier. This is a product-consistency gap, not a failure of 1.4.4 because browser zoom to 200% passes. |
| 1.4.5 Images of Text | AA | Pass | Code inspection | The logo is an SVG mark plus HTML text. No raster or SVG image of readable text was found. |
| 1.4.10 Reflow | AA | Pass | `wcag22.spec.ts` 320px and 200% zoom tests; `a11y.spec.ts` reflow tests | Audited routes had no document-level horizontal scrolling at 320 CSS pixels or at the 200% zoom equivalent. Internal code and tab strips scroll within their own containers. |
| 1.4.11 Non-text Contrast | AA | Pass | `wcag22.spec.ts` contrast and forced-colors tests; `a11y.spec.ts` forced-colors test | Input and secondary-button borders, primary-button fill, selected-tab indicator, status marks, and focus indicators met 3:1 in the sampled states. Forced colors preserved a 2px solid status mark and a visible focus outline. |
| 1.4.12 Text Spacing | AA | Pass | `wcag22.spec.ts` text-spacing test; `a11y.spec.ts` text-spacing test | Line height 1.5, paragraph spacing 2em, letter spacing 0.12em, and word spacing 0.16em did not cause horizontal scrolling or clipped paragraphs, headings, list items, or table cells. |
| 1.4.13 Content on Hover or Focus | AA | Pass | Code inspection | Not applicable: no tooltip, popover, hover card, or focus-triggered overlay adds content. |
| 2.1.1 Keyboard | A | Pass | `wcag22.spec.ts` skip-link and tab-key tests; `a11y.spec.ts` keyboard test; `keyboard.spec.ts` | Skip link, route navigation, tabs, ordering controls, code editor exit, and mission steps are keyboard operable. Not every one of the mission interaction types was exercised in this audit; see the scope limit. |
| 2.1.2 No Keyboard Trap | A | Pass | `keyboard.spec.ts` "Tab exits the CodeMirror editor"; code inspection | Focus can leave the code editor with Tab. No modal or menu creates a keyboard trap. |
| 2.1.4 Character Key Shortcuts | A | Pass | `CodeEditor.tsx:94-135`; `Tabs.tsx:44-69` | Editor shortcuts use Ctrl/Cmd or Tab. Tabs use arrow, Home, and End keys. No single-character global shortcut was found. |
| 2.2.1 Timing Adjustable | A | Pass | Code inspection | No task time limit, countdown, or expiring form was found. The seven-second status-region clear is not a content time limit. |
| 2.2.2 Pause, Stop, Hide | A | Pass | `wcag22.spec.ts` reduced-motion test; `a11y.spec.ts` motion test | Reduced motion removes non-essential animation. Animation is short and does not auto-update content indefinitely. |
| 2.3.1 Three Flashes or Below Threshold | A | Pass | `wcag22.spec.ts` reduced-motion/flash test; code inspection | No flashing content, blinking element, autoplaying video, or marquee was found. |
| 2.4.1 Bypass Blocks | A | Pass | `wcag22.spec.ts` skip-link and page-structure tests; `a11y.spec.ts` skip-link test | The skip link is the first focusable element, becomes visible on focus, and moves focus to `#main`. Landmarks are present on every audited route. |
| 2.4.2 Page Titled | A | Pass | `wcag22.spec.ts` route-title test | Every audited route, including the project, mission, and not-found routes, had a unique, meaningful title. The root redirect resolved to the opening mission title. |
| 2.4.3 Focus Order | A | Pass | `wcag22.spec.ts` route-focus, step-focus, and page-structure tests; `a11y.spec.ts` keyboard test | Focus moves to `#main` after a user-initiated route change, to the step `h1` after a mission step change, and to the stage heading after a project stage change. No positive `tabindex` values were found. |
| 2.4.4 Link Purpose (In Context) | A | Pass | Axe route/state checks; code inspection | Links use descriptive text or are named by their surrounding heading or list item. Axe found no ambiguous-link violations. |
| 2.4.5 Multiple Ways | AA | Pass | Code inspection; `LearnScreen.tsx`; `AppShell.tsx` | Pages can be reached through primary navigation, the learning map, track search, the practice plan, and direct links. |
| 2.4.6 Headings and Labels | AA | Pass | `wcag22.spec.ts` page-structure test; axe route/state checks | Each audited route has one visible `h1` and labeled sections and controls. Axe found no heading or label violations. |
| 2.4.7 Focus Visible | AA | Pass | `wcag22.spec.ts` skip-link, forced-colors, and tab tests; `a11y.spec.ts` focus test | The skip link, form controls, buttons, and tabs showed a visible outline or equivalent focus treatment. Forced colors retained the focus outline. |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Partial | Code inspection; `AppShell.tsx:204-215`; `global.css:115-131` | No fixed or sticky header, footer, or overlay was found that obscures a focused control. There is no dedicated automated focus-obscured assertion; manual keyboard review at each viewport remains to be recorded. |
| 2.5.1 Pointer Gestures | A | Pass | Code inspection | Not applicable: no multipoint or path-based gesture is required. Ordering uses buttons and tabs use standard activation. |
| 2.5.2 Pointer Cancellation | A | Pass | Code inspection | Actions run on `click`, which fires on release. No action is triggered on pointer-down. |
| 2.5.3 Label in Name | A | Pass | Axe route/state checks; `ClubScreen.tsx:693-734`; `SettingsScreen.tsx:303-363` | Visible labels are contained in accessible names. Icon-only buttons have explicit `aria-label` values. |
| 2.5.4 Motion Actuation | A | Pass | Code inspection | Not applicable: no feature is operated by device motion or user gesture beyond standard pointer or keyboard input. |
| 2.5.7 Dragging Movements | AA | Pass | `OrderViews.tsx:39-70`; `keyboard.spec.ts` ordering test | Ordering is performed with labeled Move up and Move down buttons. No drag-only interaction was found. |
| 2.5.8 Target Size (Minimum) | AA | Pass | `wcag22.spec.ts` target-size test; `a11y.spec.ts` 44px test | Visible buttons, navigation links, tabs, inputs, selects, ranges, choice labels, map nodes, and world-system buttons met at least 24×24 CSS pixels and the project's 44×44 standard in the sampled routes. Native checkboxes and radios are 18px but sit inside larger label targets. |
| 3.1.1 Language of Page | A | Pass | `apps/web/index.html:2` | The document element declares `lang="en"`. |
| 3.1.2 Language of Parts | AA | Pass | Code inspection | The audited content is English and does not switch languages without a `lang` attribute. |
| 3.2.1 On Focus | A | Pass | Code inspection; `wcag22.spec.ts` focus tests | Focusing a control does not submit a form, open a new window, or change context. |
| 3.2.2 On Input | A | Pass | Code inspection | Input changes update local state but do not navigate, submit, or change context until the user activates a button or link. |
| 3.2.3 Consistent Navigation | AA | Pass | `AppShell.tsx:143-167`; `wcag22.spec.ts` route-title test | The same primary navigation and footer links appear in the same order on every audited route. |
| 3.2.4 Consistent Identification | AA | Pass | `AppShell.tsx`; `Tabs.tsx`; `SettingsScreen.tsx` | Controls with the same function use the same labels across screens. Tabs and buttons keep a consistent visual and accessible role. |
| 3.2.6 Consistent Help | A | Pass | `AppShell.tsx:217-234` | Not applicable: the application exposes no dedicated help, contact, chat, or self-help mechanism. The footer Settings and Placement links appear in a consistent order. |
| 3.3.1 Error Identification | A | Pass | Axe route/state checks; `SettingsScreen.tsx:311-337`; `ClubScreen.tsx:496-504` | Field errors are text, associated with the field, and announced with `role="alert"`. Axe found no form-error violations. |
| 3.3.2 Labels or Instructions | A | Pass | Axe route/state checks; `SettingsScreen.tsx:303-409`; `CodeEditor.tsx:167-175` | Inputs have persistent visible labels. Help text is associated with `aria-describedby`. The editor has a visible label and instructions. |
| 3.3.3 Error Suggestion | AA | Pass | `SettingsScreen.tsx:70-88`; `ClubScreen.tsx:338-359` | Messages state what to correct, such as the handle format, password length, or required report target. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Pass | `SettingsScreen.tsx:449-530` | Account deletion requires an explicit review step and typing the handle before the destructive action is enabled. Project drafts are saved locally before destructive replacement. |
| 3.3.7 Redundant Entry | A | Pass | Code inspection; `PlacementScreen.tsx`; `SettingsScreen.tsx` | No workflow asks for the same information twice. Placement answers are held in one pass; account and preference fields are separate data. |
| 3.3.8 Accessible Authentication (Minimum) | AA | Partial | `SettingsScreen.tsx:303-363`; code inspection | Password fields accept paste and declare password-manager autocomplete values. No CAPTCHA or cognitive test is used. The flow was not exercised with a real password manager or passkey provider. |
| 4.1.2 Name, Role, Value | A | Partial | Axe route/state checks; `Tabs.tsx:34-129`; `SettingsScreen.tsx:272-295` | Standard controls, custom tabs, toggles, and status controls expose names and states. Partial: the Settings account tabs use `role="tab"` on two buttons without `aria-controls`, a `tabpanel`, or arrow-key roving (`SettingsScreen.tsx:272-295`). They remain reachable with Tab and have programmatic names and selected state, so this is recorded as a pattern gap rather than an automated failure. |
| 4.1.3 Status Messages | AA | Pass | `wcag22.spec.ts` live-region test; `a11y.spec.ts` announcement tests | Route changes, saved preferences, mission feedback, mission completion, test results, and world actions are announced through `role="status"`, `role="alert"`, or the shared polite status region without moving focus unexpectedly. |

## Partial items and remaining work

1. **2.4.11 Focus Not Obscured (Minimum)** — no fixed overlays were found, but there is no dedicated automated assertion that every focused control stays fully visible at every viewport and scroll position. Add a browser check that scrolls each focused control into view and verifies its box against fixed or sticky ancestors.
2. **3.3.8 Accessible Authentication (Minimum)** — password paste and password-manager autocomplete are present and no cognitive puzzle exists, but the flow was not exercised with a real password manager, platform passkey, or assistive technology.
3. **4.1.2 Name, Role, Value** — the Settings account selector uses tab roles without a tabpanel or arrow-key roving. It is operable with Tab and exposes selected state, but it does not follow the complete ARIA tabs pattern. File: `apps/web/src/features/settings/SettingsScreen.tsx:272-295`.

## Test-only changes made during the audit

- `tests/browser/a11y.spec.ts`: the forced-colors status-mark assertion now scopes to the world system list and polls the computed border, because the world view re-renders and can detach the sampled node. The text-clipping assertion allows a 2px subpixel tolerance for Firefox font metrics.
- `tests/browser/a11y-surfaces.spec.ts`: the opening mission helper waits for each step heading and for asynchronous evidence recording before advancing, preventing lost clicks in WebKit.
- No application source, CSS, or content was changed for this audit.

## Environment limitation observed

The working tree contained content files that fail the mission schema (for example, `content/tracks/kotlin/121-data-classes.json` is missing the required `tags` array). The default end-to-end server validates the whole catalog and would not start from that state. The audit run used a clean content snapshot from `git HEAD` with an isolated server so the audited web routes could be exercised. This content error is outside WCAG and must be fixed separately before `pnpm test:wcag` or `pnpm test:e2e` can run against the current working tree.

## Reproduction

```text
pnpm test:wcag
node scripts/wcag-report.mjs
pnpm exec playwright test tests/browser/a11y.spec.ts tests/browser/a11y-surfaces.spec.ts
pnpm format
pnpm lint
pnpm typecheck
```

`pnpm test:wcag` runs the `@wcag22` Playwright tests. `scripts/wcag-report.mjs` runs the same tests through Playwright's JSON reporter and prints the automated pass/fail table by criterion. Neither command certifies conformance.

## Certification statement

This is an internal audit. It is not third-party certification and does not establish WCAG 2.2 AA conformance. A public conformance claim requires a completed audit by qualified reviewers, testing with people with disabilities and common assistive technologies, and remediation of the partial items above.
