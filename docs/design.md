# Design: Neural Expressive for a desk of agents

Gemini Code follows the design language Google introduced for Gemini at I/O on 19/05/2026, **Neural Expressive**, which sits on top of **Material 3 Expressive**. This page says what those define, what we took, what we left out and why. The tokens live in `dashboard/src/neural-expressive.css`, loaded last.

## What Google defined

**Material 3 Expressive** ([m3.material.io](https://m3.material.io/), [Supercharge](https://supercharge.design/blog/material-3-expressive), [Android Authority](https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/)):

- **Motion is physics, not curves.** Springs replace easing-and-duration. Material publishes CSS approximations for the web, which we use.
- **Shape carries emphasis.** 35 new shapes and shape morphing; a "full" corner token instead of 50%; a corner scale from extra-small to extra-extra-large. A button can change shape while pressed.
- **Emphasized type.** Heavier weights and tighter tracking for what matters, on the Display, Headline, Title, Body and Label scale.
- **New components.** Button groups, split buttons, docked and floating toolbars without shadows, a FAB menu, a shape-morphing loading indicator for waits under five seconds.
- On the web, shape morphing and springs are not in `@material/web` yet: we do them in CSS.

**Neural Expressive**, the Gemini app redesign ([blog.google](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/), [9to5Google](https://9to5google.com/2026/05/19/gemini-app-google-io-2026/), [Dezeen](https://www.dezeen.com/2026/05/19/google-rolls-out-neural-expressive-redesign-of-gemini-ai-tool/), [Android Authority hands-on](https://www.androidauthority.com/gemini-neural-expressive-android-app-hands-on-3668985/)):

- A **blue gradient** washes the background in light and dark; soft ombre gradients highlight words.
- The prompt box is a **floating pill**.
- **While the model thinks, the top of the screen glows in a gradient that cycles the Gemini colors**, replacing the small spinner.
- Answers read like articles: the important part first and in bold, headings, cards with images and timelines.
- Background agent work (Spark) shows live progress and asks before high-stakes actions.

**Google Sans Flex** became open source (SIL OFL) at the end of 2025, with axes for weight, width, optical size, slant, grade and **roundness** ([design.google](https://design.google/library/google-sans-flex-font), [9to5Google](https://9to5google.com/2025/12/19/google-sans-flex-font/)). **Google Sans Code** covers code. Both load from Google Fonts.

None of these sources publishes hex values, radii or spring constants for Neural Expressive. The numbers below are ours, chosen to match.

## What we applied

| Area | Before (2024) | Now |
|---|---|---|
| Type | Plus Jakarta Sans and JetBrains Mono; tiny uppercase labels tracked wide | Google Sans Flex at roundness 40, Google Sans Code; labels in sentence case at 12.5 px, weight 600; titles tracked -0.02 em |
| Background | Flat `#F0F4F9` / `#131314` | Blue-and-violet radial wash, fixed behind everything, light and dark |
| Surfaces | White cards with 1 px borders and shadows | Tonal steps (`surface-1` to `surface-3`), borders gone, one soft shadow for floating panes |
| Corners | 8 to 24 px | M3 Expressive scale: 8, 12, 16, 20, 28, 32, full. Panes and menus 28, cards 20, controls full |
| Motion | One ease curve | Springs for movement (`--spring-fast`, `--spring`), effect curves for color; buttons squash and round off when pressed |
| Agent working | A blinking square | The pane's edge runs Google's four colors and a blue glow breathes from its top; the typing dots bounce in blue, red and yellow |
| Composer | Bordered box | Tonal container, 28 px corners, a 2 px primary ring on focus |

`prefers-reduced-motion` turns every animation off.

## What we left out, on purpose

The hands-on review called the Gemini redesign "form over function": tools hidden behind a "+", a model picker that was only a chevron, settings hard to find. A desk of agents is a work tool, so:

- **The model and the agent are always named on screen**, never only an icon.
- **Tools stay visible and labeled**, not folded into one menu.
- **The glow says "working", never "how far along"**: the steps the agent took stay listed in the conversation.
- Gradients stay in the background and in the working state, never behind body text.

## Next

- Shape morphing on the send button (round while idle, squarer while sending).
- A docked toolbar for the pane actions, replacing the row of icon buttons.
- Response cards for files changed and test runs, the way Gemini shows timelines.
