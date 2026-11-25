# Gemini Code design system

25/11/2026. This document maps everything Gemini Code shows a person today and
sets the rules for every piece made from now on: the dashboard, the landing page
and site, the IDE, the blog, text messages, e-mail, slides, social posts,
business cards and the terminal.

[docs/design.md](design.md) explains why the dashboard follows Neural Expressive
and what it left out. This document is the reference: the values, the parts, and
how each kind of piece uses them. The values live in
`packages/dashboard/src/neural-expressive.css`. When this page and that file
disagree, the file wins and this page gets fixed.

## Contents

1. [Who meets Gemini Code](#1-who-meets-gemini-code)
2. [The name, the mark and the trademark rule](#2-the-name-the-mark-and-the-trademark-rule)
3. [Color](#3-color)
4. [Type](#4-type)
5. [Shape, space and elevation](#5-shape-space-and-elevation)
6. [Motion](#6-motion)
7. [Icons and images](#7-icons-and-images)
8. [Voice and words](#8-voice-and-words)
9. [The dashboard's components](#9-the-dashboards-components)
10. [Landing page](#10-landing-page)
11. [Website and docs](#11-website-and-docs)
12. [IDE: editor, VS Code and terminal](#12-ide-editor-vs-code-and-terminal)
13. [Blog](#13-blog)
14. [Text messages](#14-text-messages)
15. [E-mail](#15-e-mail)
16. [Slides](#16-slides)
17. [Social posts and link previews](#17-social-posts-and-link-previews)
18. [Business cards and print](#18-business-cards-and-print)
19. [GitHub: README, issues, releases](#19-github-readme-issues-releases)
20. [Accessibility](#20-accessibility)
21. [How this system changes](#21-how-this-system-changes)

---

## 1. Who meets Gemini Code

Every piece starts from the person who meets it.

**The person.** A developer who already uses one coding agent and wants several
working at once: an engineer, a reviewer, a debugger, each on its own task. They
arrive curious and slightly wary.

**What they want but do not say.** They do not want to babysit agents. They want
the work done in parallel, without one agent overwriting another, and without an
agent sending, paying, publishing or deleting something they did not see.

**What stops them.** They fear losing control ("what did it just run?"), a bill
they did not expect, and a tool that looks good and hides what it does.

**What they leave with.** Agents working side by side, each in its own folder,
every risky action waiting for them, and every step written in the conversation.

So every piece shows the work, not a promise:

- **Show the desk working.** Panes side by side, steps listed, an approval
  waiting. Never an abstract illustration of "AI".
- **Name things.** The model, the agent, the folder and the cost are always on
  screen and in copy.
- **Give before asking.** The live demo and the open code come before any
  sign-up.
- **True facts only.** No invented numbers, users, quotes or scarcity. A
  measured number carries its date and conditions ("in one run on 24/11/2026,
  free tier, first answer in 0.75 s").

## 2. The name, the mark and the trademark rule

### The name

**Gemini Code**, two words, both capitalized. Never "GeminiCode", "Gemini-Code"
or "GC". In code and URLs: `gemini-code`.

What it is, in one line: **an open-source desk of coding agents built around
Google Gemini.**

### The trademark rule (absolute)

Gemini Code is an independent open-source project. "Gemini" is a trademark of
Google LLC, and Google sells a product with a similar name (Gemini Code Assist).
So:

- **Every public piece that carries the name carries the notice** when it has
  room for it: _"Independent open-source project. Not affiliated with, sponsored
  or endorsed by Google. 'Gemini' is a trademark of Google LLC."_ On a business
  card, a slide or a social image, the short form: _"Independent open source.
  Not affiliated with Google."_
- **Never** use Google's logo, the Google "G", the Gemini app icon, Google's
  product screenshots, or phrasing that suggests partnership ("by Google",
  "official", "powered by Google" as a badge).
- Say what is true: "built around Google Gemini", "uses the Gemini API".

### The mark

Today the mark is a four-point star with a blue, violet and rose gradient
(`#4285F4`, `#9B72CB`, `#D96570`) on a dark rounded square
(`public/images/favicon.svg`, `GeminiSparkle` in `components/zen`).

**Open risk.** That star and that gradient are very close to the Gemini app's
own mark. Next to the word "Gemini", a reader can take Gemini Code for a Google
product, which the notice alone does not undo on a card or an icon.

**Proposal, waiting for Ciro's decision:** a mark of our own that draws what the
product is: **two or three panes side by side, rounded at the M3 corner scale,
with the working edge on one of them** (the conic glow of section 6). It reads
"a desk of agents, one at work" and belongs to no one else. Until the decision,
use the current mark as it is, never enlarge the star alone as a hero image, and
keep the notice next to it.

### Lockups

- **Horizontal:** mark at 1× the cap height × 1.6, then "Gemini Code" in Google
  Sans Flex 600, tracking -0.02 em. Space between mark and word: half the mark's
  width.
- **Mark only:** favicon, app icon, avatar. Minimum 16 px on screen, 8 mm in
  print.
- **Clear space:** the mark's half width on every side. Nothing enters it.
- **On images and gradients:** the mark sits on its own dark square, never
  directly on a busy background.

## 3. Color

Color in Gemini Code is tonal. Surfaces step from light to dark instead of being
drawn with borders, one blue carries action and selection, and Google's four
colors appear only in motion, while an agent works.

### Roles, light and dark

| Token                       | Light     | Dark      | Use                                               |
| --------------------------- | --------- | --------- | ------------------------------------------------- |
| `--gm-canvas`               | `#F6F8FC` | `#0D0E11` | The page under everything                         |
| `--gm-surface`              | `#FFFFFF` | `#16171B` | Panes, cards, menus, modals, the editor           |
| `--gm-surface-1`            | `#F2F5FA` | `#1C1E23` | A row or a card inside a surface                  |
| `--gm-surface-2`            | `#E9EEF6` | `#23262C` | Hover, chips, the icon circle                     |
| `--gm-surface-3`            | `#DFE6F1` | `#2B2F36` | Pressed, the strongest tonal step                 |
| `--gm-on-surface`           | `#1B1C1F` | `#E6E8ED` | Text and icons                                    |
| `--gm-on-surface-variant`   | `#45474D` | `#B9BDC6` | Secondary text, notes, labels                     |
| `--gm-outline`              | `#C3C7CF` | `#5B606A` | The empty radio ring, rare dividers               |
| `--gm-outline-variant`      | `#E2E6EE` | `#2A2D33` | The hairline around floating surfaces             |
| `--gm-primary`              | `#0B57D0` | `#A8C7FA` | The one action color: primary button, focus, link |
| `--gm-on-primary`           | `#FFFFFF` | `#062E6F` | Text on primary                                   |
| `--gm-primary-container`    | `#D8E5FF` | `#0F3A78` | The selected item: nav row, chosen option         |
| `--gm-on-primary-container` | `#041E49` | `#D8E5FF` | Text on the selected item                         |

### Google's four colors, and when they appear

`--ne-blue #4285F4`, `--ne-red #EA4335`, `--ne-yellow #FBBC04`,
`--ne-green #34A853`, plus `--ne-violet #9B72CB`.

- **Only for the working state:** the conic glow on the edge of a pane whose
  agent is working, the three typing dots, the ring around the account avatar.
- **Never as text color** (yellow on white fails contrast), never as a button
  fill, never to mean success or error on their own.
- Status still needs words: "Waiting for you", "Failed: …". A color is a hint,
  the word is the meaning.

### Status

| State            | How it shows                                                                    |
| ---------------- | ------------------------------------------------------------------------------- |
| Working          | The conic glow on the pane's edge and a breathing blue light from its top       |
| Waiting for you  | The approval card in the conversation, primary container, with the action named |
| Done             | The agent's last line, plain; no green check alone                              |
| Failed           | The reason in words, in the conversation; red only on the warning icon          |
| Refused (safety) | A centered line in the conversation: what was refused and why                   |

### The wash

The background is a fixed radial wash of blue and violet over the canvas
(`--ne-wash`): soft in light, deeper and dimmer in dark. It stays in the
background, never behind body text, and is the one gradient a static piece
(landing, slide, social image) may use as its ground.

### Brand colors of other companies

A connector shows its service's own icon in its own colors on a white tile, in
both themes (`connectors/brand-icons/`). That is the only place another brand's
color appears, and only to name the service.

## 4. Type

**Google Sans Flex** for everything a person reads, with the roundness axis at
40 (`'ROND' 40`, 60 on the wordmark). **Google Sans Code** for code, paths,
model ids and commands. Both are open source (SIL OFL) and load from Google
Fonts.

Fallbacks:
`'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` and
`'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`.

### Scale

| Role        | Size / line  | Weight | Tracking | Where                                  |
| ----------- | ------------ | ------ | -------- | -------------------------------------- |
| Display     | 56 / 60 px   | 600    | -0.03 em | Landing hero only                      |
| Headline    | 32 / 40 px   | 600    | -0.02 em | Page title (Settings, Connectors)      |
| Title large | 24 / 32 px   | 600    | -0.02 em | Section titles on site and blog        |
| Title       | 18 / 26 px   | 600    | -0.01 em | Modal title, card title                |
| Body large  | 16 / 26 px   | 400    | 0        | Blog and docs body                     |
| Body        | 14 / 22 px   | 400    | 0        | The dashboard's text, the conversation |
| Body small  | 13 / 20 px   | 400    | 0        | Notes, secondary lines                 |
| Label       | 12.5 / 16 px | 600    | 0        | Labels, chips, states, sentence case   |
| Code        | 13 / 20 px   | 400    | 0        | Code blocks, model ids, paths          |

Rules:

- **Sentence case everywhere.** Never tiny uppercase labels tracked wide: that
  is the one thing that dated the old screens most.
- **Hierarchy by size and weight**, never by color alone.
- **Numbers** in tables and notes use tabular figures
  (`font-variant-numeric: tabular-nums`).
- Line length: 60 to 75 characters for reading (blog, docs, e-mail).

## 5. Shape, space and elevation

### Corners (Material 3 Expressive scale)

| Token           | Value | Use                                              |
| --------------- | ----- | ------------------------------------------------ |
| `--radius-xs`   | 8 px  | Code chips, small tags                           |
| `--radius-sm`   | 12 px | Inputs inside cards, thumbnails                  |
| `--radius-md`   | 16 px | Toasts, small cards                              |
| `--radius-lg`   | 20 px | Cards, option rows, list rows                    |
| `--radius-xl`   | 28 px | Panes, menus, the composer, the search palette   |
| `--radius-2xl`  | 32 px | Modals, the account card                         |
| `--radius-pill` | full  | Buttons, chips, nav items, avatars, icon circles |

No square corners anywhere a person looks. A square in a rounded screen reads as
a bug.

### Space

A 4 px grid. The steps used: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96.

- Inside a control: 8 to 12 vertical, 14 to 16 horizontal.
- Between items in a list: 8. Between groups: 24. Between page sections: 48 on
  screen, 96 on the landing.
- **Between two panes: 12 px**, the same as the desk's edge.

### Elevation

Surfaces are told apart by tone, not by borders or shadows. Only what floats
gets a shadow:

- Panes: `--ne-shadow` (two soft layers).
- Menus, modals, the palette: the hairline `0 0 0 1px --gm-outline-variant` plus
  a long, soft drop (`0 24px 64px -24px rgba(23, 43, 77, 0.35)`).
- Behind a modal: the canvas at 55% with a 10 px blur.

## 6. Motion

Motion is springs for what moves and effect curves for what changes color.

| Token            | Curve                                 | Use                                 |
| ---------------- | ------------------------------------- | ----------------------------------- |
| `--spring-fast`  | `cubic-bezier(0.42, 1.67, 0.21, 0.9)` | Pop-in of menus and modals, presses |
| `--spring`       | `cubic-bezier(0.38, 1.21, 0.22, 1)`   | Panes and larger movements          |
| `--effects-fast` | `cubic-bezier(0.31, 0.94, 0.34, 1)`   | Quick color changes                 |
| `--effects`      | `cubic-bezier(0.34, 0.8, 0.34, 1)`    | Hover, selection                    |
| `--dur-fast`     | 150 ms                                | Hover                               |
| `--dur`          | 200 ms                                | Selection, press                    |
| `--dur-spatial`  | 350 ms                                | Anything that changes place or size |

- **The pop:** floating surfaces enter from 8 px below at 97% scale (`ne-pop`).
- **The press:** buttons and cards squash to 98.5% while pressed.
- **The working glow:** a conic gradient of the four colors turning on the
  pane's edge. It means "working", never "how far along": the steps stay listed
  in the conversation.
- **One loader, then skeletons:** a screen waiting for data shows one loader,
  then skeleton rows; never a spinner per item.
- `prefers-reduced-motion` turns every animation off. Every piece that moves
  (site, slides, video) honors it or has a still version.

## 7. Icons and images

### Icons

- **Tabler Icons** (outline) at 16, 18, 20 or 24 px: `@tabler/icons-webfont`
  (`ti ti-…`) at Tabler's standard stroke, and `@tabler/icons-react` at
  `stroke={1.5}` where a lighter line sits next to text.
- An icon in a tonal circle (`--gm-surface-2` or the primary container) marks a
  kind of thing: a section, an option, a result in search.
- **An icon never stands alone for an action that matters.** Tools, the model
  and the agent are labeled.
- **No emoji, anywhere**: screens, commits, e-mail, posts, messages, slides. The
  glyph carries the state, the word carries the meaning.

### Images

- **Show the real product.** Screenshots of the dashboard at work, in light or
  dark, cropped to the part that matters (a pane with its steps, an approval
  card, the file tree with A and M marks).
- Screenshots come from the live demo or a local run with example data. Never a
  mock-up of a feature that does not exist, never a person's real data, e-mail
  or path.
- Frame a screenshot on the wash, at `--radius-xl`, with the pane shadow. No
  fake device frames, no 3D tilt.
- No stock photos and no generated "AI brain" art. If a person appears, it is a
  real person who agreed.

## 8. Voice and words

### Voice

Gemini Code talks like a careful colleague who did the work and shows it:
direct, specific, calm. It says what happened, what it found, and what it needs
from the person.

- **Lead with the outcome**, then how. "Created `mult.js` and its test; 3 pass."
- **Name the thing**: the file, the model, the agent, the amount.
- **Say failures plainly** with the reason and the next step. "I did not do it:
  `/etc/hosts` is outside the agent folder."
- **No filler** ("Great question", "Let's dive in"), no hype ("revolutionary",
  "supercharge", "10×"), no machine tells.
- **Never blame the person.** A refusal explains the rule, not the mistake.

### Language

- **English first.** Every text is written in English; Brazilian Portuguese is a
  full translation (`lib/pt.json` in the dashboard; `README.pt-BR.md` in the
  repository). A public piece exists in both or says which one it is.
- Dates: `25/11/2026` in Portuguese, `11/25/2026` or `Nov 25, 2026` in English.
  Numbers: `1,234.5` in English, `1.234,5` in Portuguese.
- Money: `US$ 3` per million tokens, the provider's currency, with the date of
  the price.

### Words we use

| Use            | Not                   | Meaning                                            |
| -------------- | --------------------- | -------------------------------------------------- |
| agent          | bot, assistant, AI    | One worker with its folder, model and instructions |
| the desk       | workspace, board      | The panes of agents side by side                   |
| pane           | window, tab           | One agent's place on the desk                      |
| agent folder   | sandbox               | The only folder an agent can read and write        |
| connector      | integration, plugin   | A service the agents reach through MCP             |
| approval       | confirmation popup    | A risky action waiting for the person              |
| AI account     | provider, credentials | A Gemini API key and the models it opens           |
| the risk judge | the filter            | What reads each action before it runs              |

## 9. The dashboard's components

The parts below exist today; build new screens from them. Each lives in
`neural-expressive.css` under the section of the same name.

| Part                | Shape and tone                                                                    | Notes                                             |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Navigation column   | Transparent on the wash; items 44 px pills; selected in primary container         | Sections set apart by space, never by rules       |
| Agent row           | Avatar, name, last line, time; selected row filled                                | Keyboard focus is a 2 px inset ring               |
| Pane                | Surface, `--radius-xl`, pane shadow; working glow on the edge                     | 12 px between panes                               |
| Conversation        | Person on the right in a tonal bubble; agent on the left, name and model on top   | Steps fold into "N steps · time"                  |
| Approval card       | Primary container, the action and its target named, Allow and Refuse              | The only place an agent waits for a person        |
| Refusal line        | Centered small text between hairlines                                             | Says what and why                                 |
| Composer            | Tonal container, 28 px corners, 2 px primary ring on focus                        | Chips for model, connections, skills, folder      |
| Chip                | Pill, `--gm-surface-2`, label 12.5 px                                             | Removable chips carry an × with an aria-label     |
| Button              | Pill. Filled primary for the one main action, tonal for the rest                  | Never two filled buttons side by side             |
| Icon button         | 36 px circle, transparent, `--gm-surface-2` on hover                              | Always an aria-label                              |
| Menu                | Surface, `--radius-xl`, hairline and drop shadow, pop-in                          | Closes on Escape and outside click                |
| Account card        | Menu at `--radius-2xl`: e-mail, avatar in the four-color ring, greeting, one pill | The version at the foot                           |
| Modal               | Surface, `--radius-2xl`, blurred backdrop, glyph in a circle, title, ×            | Escape closes; focus starts on the current choice |
| Option list         | Rows at `--radius-lg` on `--gm-surface-1`; chosen in primary container with check | A radiogroup; arrows move, Enter chooses          |
| Search palette (⌘K) | 680 px, `--radius-xl`, 64 px input, results in groups with icon circles           | One selection at a time                           |
| Connector tile      | Brand icon on white, name, line, Connect                                          | A failure says why in words                       |
| File tree           | Rows with A (added) and M (modified) marks                                        | Updates live                                      |
| Code editor         | Monaco on `--gm-surface`, Google Sans Code                                        | Cmd/Ctrl+S saves                                  |
| Toast               | `--radius-md`, title and one line                                                 | Says what happened, never "Success!"              |
| Skeleton            | `--gm-surface-1` blocks in the shape of the content                               | After the one loader                              |

Every screen exists in light and dark, at 390 px wide and at desktop width, with
its empty, loading, error and full states. "Nothing here yet" is never shown for
a failure: a failure says it failed.

## 10. Landing page

**Job:** a developer arrives from GitHub, a post or a search, and in one scroll
understands what the desk is, sees it work, and leaves with the demo open or the
code cloned.

**Ground:** the wash, light by default, following `prefers-color-scheme`.
Content column 1120 px; text column 680 px. Phone: 16 px gutters, one column, no
horizontal scroll.

**Order of sections:**

1. **Hero.** Display headline that names the tension, one line under it, two
   actions.
   - Headline: "Several coding agents at once. You decide what matters."
   - Line: "An open-source desk built around Gemini: each agent in its own
     folder, every risky action waiting for you."
   - Actions: **See the live demo** (filled pill) and **View on GitHub** (tonal
     pill).
   - Under them, the notice in body small.
   - The image: a real screenshot of three panes working, one with the glow.
2. **How it works,** three steps with a screenshot each: open agents side by
   side; each works in its own folder; you approve what matters.
3. **What stays in your hands:** the risk judge, approvals, the vault that keeps
   keys out of the model, refusals said in words.
4. **Built around Gemini:** the models, the measured speed with its date and
   conditions, failover. No benchmark we did not run.
5. **Open source:** Apache 2.0, the repository, the changelog, how to
   contribute.
6. **Start:** the install block (today `git clone`, `bun install`,
   `bun run dev`; the one-line installer when it ships), and the demo again.
7. **Footer:** the full trademark notice, license, GitHub, changelog, contact.

**Components:** the dashboard's buttons, chips and cards; code blocks in Google
Sans Code on `--gm-surface-1` at `--radius-lg` with a copy button. The working
glow may run once on the hero screenshot, never in a loop behind text.

**Measure** visits and the two actions as goals. No cookie banner tricks, no
pop-up, no e-mail wall before the demo.

## 11. Website and docs

The site is the landing plus documentation pages, the changelog and the blog,
under the same header.

- **Header:** mark and name on the left; Docs, Changelog, Blog, GitHub on the
  right; the language switch (English · Português) as a quiet text button.
- **Docs layout:** a left column of pages (240 px), the article (680 px), and on
  wide screens a right column with the page's headings.
- **Doc page:** title (headline), one-line summary, then the steps. Code blocks
  copyable; every command runnable as written; paths relative to the repository.
- **Callouts:** note (primary container), warning (surface-1 with the warning
  icon in red and the word "Warning"). No colored boxes without a word.
- **The changelog page** renders `CHANGELOG.md` as it is: newest first, Added,
  Changed, Fixed, Removed, with dates and pull request links.
- **404:** says the page is not here and links Docs and the demo.

## 12. IDE: editor, VS Code and terminal

### The editor inside the dashboard

Monaco with the themes `gemini-light` and `gemini-dark`: VS Code's own syntax
colors, with the editor and gutter set to `--gm-surface` (`#FFFFFF`, `#16171B`)
so it sits flush in its pane. Font: Google Sans Code 13 px, line 20.

### A VS Code theme (when we publish one)

Built from the same tokens, so the editor and the desk read as one product:

| VS Code key                                    | Light     | Dark      |
| ---------------------------------------------- | --------- | --------- |
| `editor.background`                            | `#FFFFFF` | `#16171B` |
| `sideBar.background`, `activityBar.background` | `#F6F8FC` | `#0D0E11` |
| `editorGroupHeader.tabsBackground`             | `#F2F5FA` | `#1C1E23` |
| `tab.activeBackground`                         | `#FFFFFF` | `#16171B` |
| `focusBorder`, `button.background`             | `#0B57D0` | `#A8C7FA` |
| `list.activeSelectionBackground`               | `#D8E5FF` | `#0F3A78` |
| `editor.foreground`                            | `#1B1C1F` | `#E6E8ED` |
| `editorLineNumber.foreground`                  | `#6F737B` | `#8C919B` |
| `statusBar.background`                         | `#F2F5FA` | `#1C1E23` |
| `progressBar.background`                       | `#4285F4` | `#A8C7FA` |

Syntax stays VS Code's defaults (inherit), so code reads as developers expect.

### Terminal and command line

What the server, the installer and any CLI print:

- **Plain lines, one fact each**, prefixed by the part in brackets:
  `[subscription] ready (4 models)`, `[server] listening on :8787`.
- **Color only for meaning**, from the 16 ANSI colors so every terminal theme
  keeps working: green for done, yellow for waiting, red for failed, dim for
  detail. Never color alone: the word says it too.
- No emoji, no spinners that leave garbage in logs; a progress line rewrites
  itself only when the output is a terminal.
- An error says what failed, why, and the command to try next.
- Every key or token is masked; a path is relative to the repository or `~`.

## 13. Blog

**Job:** teach one thing a developer can use, from work we did, and point to the
code.

- **Layout:** title (title large on phone, headline on desktop), one-line
  summary, date and author, then the article at 680 px in body large.
- **Structure:** the problem in the first paragraph, what we tried, what worked
  with the evidence (commands, outputs, numbers with dates), what it means for
  the reader. Headings every 3 to 5 paragraphs.
- **Code:** Google Sans Code blocks with the language named and a copy button;
  outputs shown as they were.
- **Images:** real screenshots framed as in section 7; diagrams in the token
  colors on the surface, labeled in words.
- **Cover / link preview:** 1200 × 630, the wash as ground, the title in
  headline weight at left, a cropped real screenshot at right, the mark and name
  small at bottom left with "Not affiliated with Google".
- **End:** one next step (try it in the demo, read the code, the related doc).
  No newsletter pop-up.
- Every post exists in English; the Portuguese version is a translation, not a
  second post.

## 14. Text messages

WhatsApp, SMS, Slack, Discord, a GitHub comment: short text a person reads
between other things.

- **One message, one subject.** Lead with what matters: "Gemini Code 0.2.0 is
  out: the one-line installer for macOS, Linux and Windows."
- **Three lines at most** before a link. The link last, alone on its line.
- **Who is writing,** when the reader may not know: the first message says who
  you are and why you are writing.
- **No emoji, no stickers, no "Hey!!!".** Plain punctuation.
- **No formatting that breaks:** WhatsApp shows `*bold*` but Slack and SMS do
  not; write so the text reads without it.
- A reply answers the question first, then adds context.
- Never send keys, tokens, passwords or a person's data in a message.

Example:

> Ciro here, I make Gemini Code (open source, a desk of coding agents built
> around Gemini). You asked about running agents in parallel: this 2-minute demo
> shows three at work, no install needed.
>
> https://ciro-maciel.github.io/gemini-code/

## 15. E-mail

Release notes, an invitation to a shared agent, a sign-in code, a reply to a
contributor.

### Layout

- **600 px** single column, 24 px padding, on `#F6F8FC`; the content on a white
  card at 20 px corners (clients that drop radius get square, which is fine).
- **Header:** the mark (PNG, 32 px, with alt text "Gemini Code") and the name.
  No banner image.
- **Type:** Google Sans Flex where the client loads web fonts (Apple Mail),
  falling back to `Arial, Helvetica, sans-serif`. Body 16 / 24 px, `#1B1C1F`.
- **One button:** a pill in `#0B57D0` with white text, built in HTML (not an
  image), with the link also written as text below it.
- **Dark mode:** set `color-scheme: light dark` and test in Apple Mail and
  Gmail; the mark has a version that works on dark.
- **Footer:** why the person gets this e-mail, how to stop, the trademark
  notice, the repository link.
- Always a **plain-text part** with the same content.

### Writing

- **Subject:** the outcome, under 60 characters, no emoji, no "Re:" tricks, no
  all caps. "Gemini Code 0.2.0: install with one command".
- **Preheader:** the line that follows the subject, completing it.
- First sentence: why this reaches them. Then what changed, as a short list.
  Then one action.
- A code (sign-in, verification) is large, in Google Sans Code, easy to copy,
  with how long it lasts.

## 16. Slides

The pitch to Google, a talk, a demo day. Made in the house's Decks or any tool,
by these rules:

- **16:9, 1920 × 1080.** Ground: the wash (light) or `#0D0E11` with the dark
  wash for dark rooms.
- **One idea per slide**, written as a sentence that makes the point ("Each
  agent works in its own folder"), not a topic ("Isolation").
- Headline 64 px, body 32 px minimum, at most three lines of body.
- **Show the product:** a real screenshot or a short recording on most slides. A
  diagram is drawn in the tokens and labeled.
- **Numbers** big, with their source and date under them.
- The title slide and the last slide carry the mark, the name and the short
  trademark notice; the last one also the repository and a contact.
- Speaker notes hold what is said; the slide holds what is seen.

## 17. Social posts and link previews

LinkedIn, X, Bluesky, Mastodon, the GitHub social preview.

- **Sizes:** link preview and GitHub social image 1200 × 630; square post 1080 ×
  1080; portrait 1080 × 1350.
- **Composition:** the wash; a short claim in headline weight (eight words or
  fewer); a real screenshot cropped to one thing; the mark, the name and "Not
  affiliated with Google" at the bottom.
- **Text of the post:** the problem in the first line, what we built or learned,
  the evidence, one link. No hashtags wall (two at most), no emoji, no
  engagement bait.
- **A video** opens on the product working within the first two seconds, has
  captions burned in, and works without sound.
- Never our traffic, users or revenue in a public post; teach from the work.

## 18. Business cards and print

### Business card

- **Size:** 90 × 50 mm (the Brazilian standard) or 85 × 55 mm, with 3 mm bleed
  and a 4 mm safe margin.
- **Front:** the dark ground (`#0D0E11`) with the mark centered at 12 mm, the
  name "Gemini Code" under it in Google Sans Flex 600 at 11 pt, and the one-line
  description at 7 pt in `#B9BDC6`. The dark wash may tint the ground very
  softly; a flat dark is the safe choice in offset.
- **Back:** white ground. The person's name (11 pt, 600), role ("Maker of Gemini
  Code"), e-mail, the repository URL in Google Sans Code at 8 pt, and a QR code
  (at least 18 mm, quiet zone included) that opens the live demo. The short
  trademark notice at 6 pt at the bottom.
- **Color:** the files are sRGB with the tokens above; the printer converts with
  its own profile, and a printed proof is checked before the run. The blue
  `#0B57D0` and the dark ground are the colors to watch on the proof.
- **Paper:** uncoated or soft-touch, 350 g or more. No gloss, no foil star.

### Other print (badge, sticker, poster)

- The mark on its dark rounded square works alone on a sticker (die cut
  following the square's corners).
- A poster follows the slide rules: one sentence, one real screenshot, the mark,
  the notice, a QR code to the demo.

## 19. GitHub: README, issues, releases

- **README:** the promise in bold first, the problem in plain words, the demo
  link, the trademark notice, then what it does, quickstart, models, how it is
  built, roadmap, contributing, license. English, with `README.pt-BR.md` as the
  translation.
- **Release notes:** the version and date, then the CHANGELOG section of that
  version as it is.
- **Issues and pull requests:** the outcome in the title (Conventional Commits),
  the evidence in the body (what was run, what it printed), screenshots of UI
  changes in light and dark, the demo preview link.
- **Social preview image:** section 17.

## 20. Accessibility

- **Contrast:** body text at least 4.5:1, large text and icons at least 3:1.
  Measured on 25/11/2026 (WCAG 2 ratio): `#1B1C1F` on `#FFFFFF` 17.0, `#45474D`
  on `#F2F5FA` 8.5, `#0B57D0` on `#FFFFFF` 6.4, `#041E49` on `#D8E5FF` 12.9,
  `#6F737B` on `#FFFFFF` 4.8; dark: `#E6E8ED` on `#16171B` 14.6, `#B9BDC6` on
  `#1C1E23` 8.9, `#A8C7FA` on `#16171B` 10.4, `#D8E5FF` on `#0F3A78` 8.7.
  Google's yellow (1.7 on white) and green (3.1) fail as text and never carry
  it.
- **Keyboard:** everything reachable; focus is a 2 px primary ring that follows
  the shape; dialogs trap focus, start it on the current choice and close on
  Escape.
- **Names:** every icon button and removable chip has an aria-label; option
  lists are radiogroups; live updates use polite announcements.
- **Motion:** `prefers-reduced-motion` turns animation off; nothing flashes.
- **Language:** the page's `lang` follows the chosen language; each language's
  name is shown in its own language.
- **Touch targets** at least 40 px on phone.

## 21. How this system changes

- **The values live in code**: `packages/dashboard/src/neural-expressive.css`
  for the dashboard; this page for everything else. A new token is added there
  first, then documented here.
- **Every change goes through a pull request** with its line in `CHANGELOG.md`,
  screenshots in light and dark, and the demo preview.
- **A deviation is a bug.** A screen or a piece that does not follow this page
  is fixed, or this page is changed on purpose, with the reason written down.
- **Open decisions:**
  - The mark (section 2): keep the star or move to the panes mark.
  - A published VS Code theme (section 12).
  - The landing page and site (sections 10 and 11) are specified here and not
    built yet.
