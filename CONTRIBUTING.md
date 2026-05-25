# Contributing to GOPS

Thanks for being interested. This is a tiny static project — no build, no framework, no friction. **Any improvement is welcome**, from a typo fix to a whole new mode.

## Quick start

```bash
git clone https://github.com/amsanghi/gops.git
cd gops
python3 -m http.server 8000   # or any static server
open http://localhost:8000
```

That's it. No `npm install`, no transpile step.

## Project layout

```
index.html          Markup + semantic structure
styles.css          All CSS (design tokens, components, screens, modals)
manifest.json       PWA manifest
sw.js               Service worker (network-first HTML + stale-while-revalidate)
js/
  app.js            Entry: wires everything together
  constants.js      Static data (puzzles, AIs, achievements, themes)
  state.js          Single S object + pub/sub event bus
  storage.js        Namespaced localStorage helpers
  util.js           Tiny helpers (shuffle, escapeHtml, copy, confirmDialog)
  effects.js        Audio, haptics, confetti, floating reactions
  render.js         Card / hand / board rendering
  ai.js             AI bidding logic
  game.js           Core 2-player flow
  multi.js          PeerJS 1v1 multiplayer
  multiN.js         PeerJS N-player party rooms + voice/video
  modes.js          Mode launchers (daily, puzzle, endless, ...)
  ui.js             Lobby, modals, theme, chat, end screen
  share.js          Sharing: image, text, replay URL, CSV, snapshot, video
  timer.js          Per-bid countdown
  achievements.js   Unlocks + toast
  coach.js          Post-game analyzer
  charts.js         Canvas drawing (heatmap, score curve)
tests/
  index.html        Test runner page (open this in a browser)
  run.js            ESM test cases
```

## Ways to contribute

### 🐛 Bugs & ✨ feature requests

Use the [issue templates](https://github.com/amsanghi/gops/issues/new/choose). Short repros, screenshots, and what you expected vs. what happened — that's all we need.

### 🧩 Add a puzzle

Open [`js/constants.js`](./js/constants.js) and append to `PUZZLES`. Each puzzle is just:

```js
{ id: 11, title: 'My puzzle', desc: 'Short description.', deckSize: 7,
  scripted: [ {ai: 5, prize: 3}, {ai: 7, prize: 1}, /* ... per round */ ],
  goal: 'Beat the AI by 3+ points.' }
```

`scripted` is optional. If omitted, prizes are shuffled and the AI uses the chosen difficulty.

### 🎭 Add an AI personality / catchphrase

Add lines to `AI_CATCHPHRASES` in `constants.js`. Behavior rules live in `js/ai.js`.

### 🎨 Add a theme

In `js/constants.js`, push to `THEMES`. In `styles.css`, add a `[data-theme="..."]` block:

```css
[data-theme="ocean"] {
  --me: #06b6d4;
  --me-soft: rgba(6,182,212,0.12);
  --me-glow: rgba(6,182,212,0.30);
}
```

### 🤖 Tune the AI

`js/ai.js` is small and readable. Try adjusting the easy/medium/hard logic or adding a new personality.

### 🪄 Add a mode

Add a launcher to `js/modes.js`, a tile to the lobby in `index.html`, and wire the click in `js/app.js`. Look at how `startBullet` works as a template.

### 📷 Visual changes

`styles.css` is one file. Design tokens are at the top (`:root { ... }`). Theme variations are just CSS variables.

## Style guide

- **No frameworks.** Vanilla JS + DOM. ESM modules only.
- **No build step.** Anything that requires `npm install` to run is a non-starter.
- **Static-host-friendly.** Must work on GitHub Pages with no server.
- **Privacy-first.** All state in `localStorage`. No analytics. No tracking.
- **Accessibility.** Keep ARIA labels, keyboard support, `prefers-reduced-motion`, color-blind palette working.
- **Be terse.** Read the existing code — it's small for a reason.

### Code style

- 2-space indent, single quotes, semicolons.
- Prefer `const` over `let`. Avoid `var`.
- No comments that restate the code. Comments should explain *why*, not *what*.
- Small files. Module boundaries should be obvious.

## Testing

Open `/tests/` in a browser to run the in-browser test suite. Add tests for new modules to `tests/run.js`.

Manual: every PR should be verified by playing through at least one solo game and the relevant new feature.

## Pull requests

1. Fork the repo.
2. Create a branch (`gops-feature-name`).
3. Make your changes.
4. Test in a browser.
5. Open a PR. Use the [PR template](./.github/PULL_REQUEST_TEMPLATE.md).
6. Be patient. This is a side project.

We don't require sign-offs or DCO. The PR template asks for a short description and a test plan.

## Code of conduct

Be kind. We're here to play a card game. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
