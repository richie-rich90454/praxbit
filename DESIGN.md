# Design rules

Praxbit should feel like a calm, precise workshop: white paper, black ink, one red accent, one green for success, one amber for caution, and one red for errors. The interface is dense with meaning, not decoration. Nothing should look like a generic SaaS dashboard or a purple AI template.

## Palette

These are the required core colors. Do not introduce additional brand hues.

| Token          | Hex       | Role                                               |
| -------------- | --------- | -------------------------------------------------- |
| `--background` | `#FFFFFF` | Page and card background                           |
| `--foreground` | `#000000` | Primary text and primary actions                   |
| `--accent`     | `#B54131` | Links, focus, selected state, one primary emphasis |
| `--success`    | `#236A50` | Healthy, passed, verified                          |
| `--warning`    | `#926300` | Degraded, attention, not yet verified              |
| `--error`      | `#B42318` | Failed, destructive, blocked                       |
| `--border`     | `#D6D6D6` | Dividers, input borders, table rules               |
| `--support`    | `#555555` | Secondary text and metadata                        |

Supporting neutral values already in the token file are allowed for surfaces and stronger borders:

| Token              | Hex       | Role                                                 |
| ------------------ | --------- | ---------------------------------------------------- |
| `--surface`        | `#F7F7F5` | Quiet inset surface, code blocks, hovered navigation |
| `--surface-raised` | `#FFFFFF` | Raised surface; still no shadow                      |
| `--border-strong`  | `#9A9A9A` | Inputs that need stronger definition                 |
| `--accent-strong`  | `#8F3024` | Hover/active accent only                             |

Rules:

- Do not use a color as the only carrier of meaning. Pair status color with a word and, where useful, a shape or icon.
- `#D6D6D6` is a border, not body text. Never use it for text on white.
- Do not tint large backgrounds with accent colors. Accent is for small, meaningful emphasis.
- Do not invent success greens, warning ambers, or error reds. The four semantic colors above are the set.
- Do not use gradients, even subtle ones. Do not use colored glows or colored shadows.

Contrast: the core text colors against white are intended to meet WCAG AA for normal text. Verify with a contrast tool during review; this document is not a certification. Border and decorative colors are exempt only when they are not conveying text.

## Typography

- Interface: **Noto Sans**, weights 400, 500, 700. Loaded from `@fontsource/noto-sans`.
- Code, terminal, identifiers, and tabular values: **Noto Sans Mono**, weights 400 and 600. Loaded from `@fontsource/noto-sans-mono`.
- Fallbacks are allowed for resilience (`system-ui`, `Segoe UI`, monospace), but production screens must use Noto Sans and Noto Sans Mono.
- Do not use a display font, a serif, a handwriting font, or a second sans family for headings.

Type scale (desktop tokens):

| Token              | Size | Use                             |
| ------------------ | ---- | ------------------------------- |
| `--text-title`     | 32px | Page title, one per screen      |
| `--text-section`   | 22px | Section heading                 |
| `--text-component` | 17px | Component heading               |
| `--text-body`      | 16px | Body text                       |
| `--text-support`   | 14px | Secondary text, labels          |
| `--text-meta`      | 13px | Metadata only; never long prose |

- Line height: body `1.6`, headings `1.3`.
- Headings are sentence case. Do not use all-caps headings, labels, buttons, or navigation.
- Letter spacing is `0` except the existing slight tightening on the page title (`-0.01em`). Do not introduce wide tracking.
- Body text should stay near 60–75 characters per line. Do not stretch prose across a 1440px screen.
- Use bold weight for hierarchy, not color alone.
- Do not center long paragraphs. Center only short empty-state text.
- Do not use italics for UI labels. Use them sparingly for emphasis in prose if needed.

## Spacing and layout

- The spacing base is **4px**. Use the scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Do not use arbitrary pixel values for margins, padding, or gaps when a token exists.
- Page content max width is `1120px`. Use a narrower reading width for prose and practice.
- Common rhythm: 24px between major sections, 16px inside a surface, 8px between related controls, 4px between a label and its value.
- Use `gap` in flex/grid rather than margin chains.
- Responsive breakpoints are content-driven; the existing 640px type adjustment and 700px project layout breakpoint are examples. Test desktop, tablet, and mobile rather than assuming a single breakpoint is enough.
- Do not nest cards inside cards inside cards. One surface level is usually enough. A panel inside a page section is acceptable when it has a distinct job.
- Do not use decorative sidebars, floating action buttons, or dashboard filler.

## Radius and elevation

- Ordinary rounded surfaces use **exactly 5px** (`--radius: 5px`). Buttons, inputs, panels, code blocks, notices, and dialogs all use 5px.
- Do not use 8px, 12px, 16px, or fully rounded “pill” containers. Status dots and the mascot are shapes, not rounded surfaces.
- No shadows. Use a 1px border and background contrast to separate surfaces.
- No glassmorphism, backdrop blur, frosted panels, inner glows, or bevels.
- No left-side accent bars on cards, notices, or list items. Use a border, a label, and spacing instead. The existing global notice is a full-width strip with a top/bottom border, not a left accent bar.
- Dividers are 1px `#D6D6D6`. Do not use thick decorative rules.

## Prohibited visual patterns

The following are review failures:

- Gradients of any kind.
- Box shadows, text shadows, drop shadows, glows.
- Glassmorphism, translucent blur, frosted cards.
- Purple template aesthetic or generic AI orb imagery.
- Left accent bars on cards, alerts, or navigation items.
- All-capital UI headings, labels, buttons, or navigation.
- Random middle dots (`·`) used as decoration. The existing metadata separators are textual punctuation in compact status lines; do not scatter them through prose or headings.
- Decorative pills, chips, or badges whose only purpose is visual interest. A status label with a real state is allowed; a rounded capsule used as ornament is not.
- Emoji as interface icons.
- Stock dashboard charts with no learning meaning.
- Skeuomorphic terminals, fake scanlines, neon cyberpunk styling.
- Parallax, floating blobs, looping background animation, or attention-seeking motion.
- Fake loading progress that does not represent real work.

## Sentence case and voice

- Interface copy is sentence case: “Start practice”, “Review due”, “Campus systems”.
- Product name is “Praxbit”, not “PRAXBIT” or “praxbit” in prose.
- Use plain verbs. Prefer “Check your answer” over “Submit response”.
- Do not shame the learner. No “You failed”, “Wrong again”, or “Don’t lose your streak”.
- Do not use exclamation marks in system messages. A completion can be warm without shouting.
- Do not use marketing superlatives in the product. Say what happened and what to do next.
- Explain errors with evidence: what is wrong, where, and one next step. Do not dump a stack trace without a readable summary.
- Metadata may be compact, but it must remain readable. Use a separator only when it clarifies; do not decorate with dots.

## Motion

- Motion duration is **120–250ms**. The default token is 160ms.
- Use motion for state change, spatial continuity, and feedback. Do not animate content that is still being read.
- Easing should be a simple ease-out. Avoid bounce, elastic, spring, and infinite loops.
- Hover and focus transitions are short (120–160ms). Panel expansion may use up to 250ms.
- Respect `prefers-reduced-motion: reduce` and the in-app motion preference (`system`, `reduce`, `full`). When reduced, remove transforms, parallax, and non-essential animation; keep instant state changes and, at most, a short opacity change.
- Pause or avoid animation when the document is hidden. Clean up PixiJS renderers and workers on unmount.
- Do not animate the mascot continuously. A pose change may be instant or a short transition.
- Do not use animation to hide loading or to imply progress that is not measured.

## Accessibility

These are requirements, not enhancements.

- Every interactive control is reachable and operable by keyboard. No keyboard traps except a deliberate modal, which must close with Escape and restore focus.
- Visible focus is mandatory. Use the 2px accent focus ring with 2px offset. Do not remove outlines without an equivalent visible replacement.
- Use semantic HTML: `header`, `nav`, `main`, `section`, `table`, `caption`, `th scope`, `button`, `label`. Do not build a button out of a `div`.
- Every page has one `h1`; heading levels do not skip.
- Provide a skip link to the main content. The main content target is focusable but does not show a stray outline on pointer use.
- Form fields have persistent labels, not placeholder-only labels. Errors are announced and associated with the field.
- Status messages use an appropriate live region only when the change is important and not already focused. Do not announce every keystroke.
- Images that convey meaning have alt text. Decorative images are hidden from assistive technology. The PixiJS canvas is hidden; the accessible system list carries the same state.
- Color is never the only signal. Status uses a word plus a mark or icon.
- Touch targets are at least 44×44 CSS pixels, or have equivalent spacing.
- Text can scale to 200% without loss of content or horizontal scrolling at a 320px viewport. The in-app text scale (0.9–1.4) must not clip controls.
- Contrast meets WCAG AA for normal text and UI components. Verify during review.
- Reduced motion is honored at the OS level and in settings.
- The interface works offline for cached foundational lessons and keeps local progress on refresh.
- Screen-reader notes exist for complex interactions: code editor, test results, world map, terminal simulation, and drag/order controls. Provide a non-drag alternative for ordering where practical.
- Do not autoplay audio. Sound is opt-in and defaults off.

## Loading, empty, and error states

- Loading states name what is loading and keep the layout stable. Use a short text status or a bounded skeleton; do not shimmer indefinitely.
- Empty states say what is missing and the next useful action. Do not use a decorative illustration as the only content.
- Errors state what failed, whether local work is safe, and what to try. Network errors must say that progress is saved locally when that is true.
- Offline mode is a first-class state: show a quiet status strip, keep reading and practice available where cached, and queue writes.
- Do not show a success message before the server or local evaluator has actually accepted the result.
- Do not present a local result as verified competition evidence.

## Screenshot review process

For every major screen or visual change:

1. Build the web app and run it against a representative API state.
2. Capture desktop (1440×1000), tablet (834×1112), and mobile (390×844) screenshots. Playwright uses these sizes.
3. Review the actual screenshots, not only the diff percentage. Check type, spacing, alignment, contrast, focus, and content density.
4. Inspect these states where they apply: default, loading, empty, error, offline, long content, keyboard focus, reduced motion, 200% text scale, and narrow viewport.
5. Confirm that no prohibited pattern is present: gradient, shadow, glass, glow, left accent bar, all-caps heading, decorative pill, middle-dot decoration, or generic dashboard filler.
6. Compare against the committed visual baseline. A small pixel diff is not automatically acceptable; a large diff is not automatically wrong. Explain the change.
7. Record the review in the pull request. If a screenshot baseline changed intentionally, include the reason.
8. Do not accept a screen because it renders. Reject generic generated layouts, inconsistent spacing, and unreadable density.

The Playwright visual configuration disables animations and allows a 2% pixel difference. That threshold is a tool, not a judgment. A human must still look at the images.
