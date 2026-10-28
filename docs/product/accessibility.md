# Accessibility

Praxbit must be usable by learners with different vision, hearing, motor, cognitive, and situational abilities. Accessibility is part of the definition of done, not a later audit.

The implementation is not certified against WCAG. These are requirements and review criteria; a formal audit and assistive-technology matrix are still needed.

## Structure and navigation

- Each page has one `h1`. Heading levels do not skip.
- Landmarks: `header`, `nav`, `main`, `footer`. The main content has an id and is the skip-link target.
- The skip link is the first focusable element and becomes visible on focus.
- Primary navigation has exactly five destinations: Learn, World, Practice, Projects, Club.
- The current page uses `aria-current="page"`.
- Every page has a meaningful document title.
- Links are links and buttons are buttons. Do not put a click handler on a `div`.
- Focus order follows the visual order. Do not use positive `tabindex`.

## Keyboard

- Every interactive control is reachable and operable by keyboard.
- Focus is always visible. The ring is 2px accent with a 2px offset.
- Do not remove outlines without an equivalent visible focus state.
- Dialogs and menus close with Escape and restore focus to the trigger.
- No keyboard trap outside a deliberate modal.
- Ordering and drag interactions have a keyboard alternative. The world map has a system list; ordering steps can be moved with buttons or a select.
- Code editors support standard text editing, indentation, and a way to run tests without a mouse.
- The terminal simulation has a labeled text input and an output log; it does not require a real terminal emulator gesture.

## Forms

- Every input has a persistent visible label. Placeholder-only labels are not acceptable.
- Errors are associated with the field and announced.
- Required fields are indicated in text, not only with an asterisk.
- Help text is associated with the control.
- Do not disable submit silently; explain what is missing.
- Password fields allow paste and password managers. Do not block them.

## Color and contrast

- Text and UI components meet WCAG AA contrast. Verify with a tool, not by eye.
- Color is never the only signal. Status uses a word plus a mark or icon.
- The palette is fixed: white, black, `#B54131`, `#236A50`, `#926300`, `#B42318`, `#D6D6D6`, `#555555`.
- `#D6D6D6` is a border, not text.
- Focus and selection remain visible in high-contrast mode.

## Text and zoom

- Body text is at least 16px at the default scale.
- The in-app text scale ranges from 0.9 to 1.4. Controls do not clip at the largest setting.
- The layout works at 200% browser zoom and a 320px viewport without horizontal scrolling for prose.
- Text is not embedded in images.
- Long words and code identifiers wrap or scroll within a bounded container; they do not push the page sideways.
- Line length is controlled for readability.

## Motion

- Motion is 120–250ms and uses a simple ease-out.
- `prefers-reduced-motion: reduce` removes transforms, parallax, and non-essential animation.
- The in-app motion preference offers system, reduce, and full.
- No infinite background animation, auto-playing video, or flashing content.
- The mascot does not animate continuously.
- Loading indicators do not shimmer indefinitely; a text status is acceptable.
- Animation does not hide a state change from a screen reader.

## Screen readers

- Decorative images are hidden; meaningful images have alt text.
- The PixiJS canvas is hidden; the accessible system list carries the state.
- Test results announce the test name, expected value, actual value, and pass/fail.
- Runtime loading and timeout states are announced.
- Live regions are used sparingly. Do not announce every keystroke or every score update.
- Icons have accessible names if they are the only content of a button.
- Tables use `caption`, `th scope="col"`, and `th scope="row"` where appropriate.
- Code blocks have a language label and remain readable as text.

## Code editor and execution

- The editor has a visible label and a described purpose.
- Tabs for files are keyboard operable and expose the selected state.
- Diagnostics are available as text, not only squiggles.
- Running tests does not move focus unexpectedly.
- A timeout is reported as a timeout, with a next step.
- A sandboxed preview is not the only way to understand the result; DOM and style checks are listed as text.
- The simulated terminal is labeled as a simulation.

## World map

- The canvas is not the only representation.
- The system list includes status, summary, dependencies, and metrics.
- Selecting a system is possible with the keyboard.
- The world log is a text list with sequence numbers.
- Recovery actions have a confirmation or a clear result message.
- A failed PixiJS load leaves the list usable.

## Offline and errors

- Offline status is announced once, not repeatedly.
- Local progress is described as saved on the device when that is true.
- A sync conflict explains what changed and does not discard local work.
- Errors state what failed and what to do next.
- A loading state names what is loading.

## Touch and mobile

- Touch targets are at least 44×44 CSS pixels or have equivalent spacing.
- Primary actions are reachable in the thumb zone.
- The layout does not rely on hover.
- The mobile navigation keeps all five destinations reachable.
- The PWA install prompt is not used as a dark pattern.

## Testing

- `pnpm test:a11y` runs the Playwright accessibility checks.
- Axe is a baseline, not a complete audit. It does not catch every keyboard or screen-reader problem.
- Manually test with a keyboard, at 200% zoom, with reduced motion, and at the largest text scale.
- Test with at least one screen reader before a public launch. Record the browser and screen-reader versions.
- Review screenshots at desktop, tablet, and mobile sizes.
- Do not claim WCAG conformance without a completed audit.

## Known gaps

- Native Android and iOS accessibility has not been tested.
- Pyodide and complex editor interactions may have screen-reader limitations.
- The visual world is decorative; the list is the primary accessible path.
- There is no formal cognitive-load or dyslexia review.
- There is no sign-language or audio version of the lessons.
