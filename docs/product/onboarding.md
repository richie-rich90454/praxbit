# Onboarding

The first session must let a complete beginner do something real within a few minutes, without an account, without a placement exam, and without a wall of setup.

## Principles

- **No account wall.** Guest mode is the default. The learner can start a mission, keep progress locally, and create an account later.
- **No prior knowledge assumed.** The first mission uses a machine and a prediction, not a code editor.
- **One clear action.** The opening screen offers a primary “Start learning” action and a secondary placement option.
- **No fake urgency.** Do not use countdowns, “limited seats”, or “your friends are ahead”.
- **Accessibility first.** Text scale, reduced motion, sound off by default, and keyboard access are available before the first exercise.
- **Honest AI choice.** AI tutoring is off by default and must be explicitly enabled. The learner is told what would be sent.

## First-run flow

1. **Landing.** Product name, one-sentence promise, “Start learning” and “I know some of this”.
2. **Optional placement.** Eight questions; the learner can skip. Skipping starts the foundation campaign. Placement marks correct skills as skipped and recommends a starting mission. It is advisory, not a lock.
3. **Interests.** Choose one or more of web, games, systems, AI, professional, or everything. Interests shape recommendations; they do not hide the curriculum.
4. **Preferences.** Text scale, motion, sound, challenge level, and optional reminders. Defaults are conservative: system motion, sound off, reminders off, standard challenge.
5. **First mission.** “Make it respond”: run a small machine, observe the rule, predict an unseen output, then name input, processing, and output.
6. **First completion.** Show what was learned, the evidence category, the XP, and the next useful action. Do not imply mastery from one success.
7. **Account prompt.** Offer an account to sync across devices and join a club. Explain that guest progress stays on the device and can be uploaded after sign-in. Do not block “Continue as guest”.

## What the learner sees

- The mission briefing names a concrete situation and a reason to care.
- The lesson is short, in plain language, and defines its vocabulary.
- The interaction is keyboard operable and has a visible focus state.
- Hints are available but not pushed. Using one is not punished.
- Feedback explains the rule, not just “correct” or “incorrect”.
- A wrong answer that matches a known misconception gets specific corrective feedback.
- Completion shows the skill evidence, XP, and the next step.
- A review is scheduled at 1 day, then 3, 7, and 14 as the learner succeeds.

## Account creation

- Handle only; no email, real name, school, or location.
- Password 10–200 characters. There is no password reset yet; say so before account creation.
- The account inherits guest progress through the sync outbox. Conflicts are shown, not silently overwritten.
- Native clients receive a bearer token and must store it in secure storage.
- Children below the applicable digital-consent age should remain in guest mode until a parental-consent flow exists.

## Re-onboarding

A returning learner sees:

- The next recommended mission, with reasons.
- Due reviews, without a guilt message.
- A short practice option.
- The world state if missions have changed it.
- A settings entry for accessibility and account.

Do not show a “welcome back, you’re behind” message. Missing a day is not a failure.

## What not to do

- Do not require placement before the first lesson.
- Do not require an account to read a cached mission.
- Do not ask for an email address that the product cannot use.
- Do not auto-enable AI, reminders, sound, or notifications.
- Do not promise that guest progress is permanently safe; browser storage can be cleared.
- Do not claim that placement certifies knowledge.
