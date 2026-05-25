# Screenshots guide

A consistent set of screenshots makes your README, social posts, and press kit look professional. Capture these *once*, reuse forever.

## What to capture

### 1. Lobby (`screenshot-lobby.png`)
- **Viewport:** 1280×800 (laptop) — looks great in any banner crop
- **Theme:** **rose** accent (`data-theme="rose"`) on dark mode — pops in feeds
- **State:** logged in as "Aman" (or your name), no resume banner, daily tile featured
- **Fonts loaded:** wait 2-3 seconds after page loads before capturing so Fraunces renders correctly
- **Crop:** trim address bar, browser chrome

### 2. In-game (`screenshot-game.png`)
- **Viewport:** 1280×800
- **Theme:** mono (default) on dark mode
- **State:** Mid-game vs Vs AI, round 5/13, your score winning, a card pending (lifted) with the drop-zone visible in the YOU slot
- **Setup:**
  - Start a Vs AI game on Medium
  - Play 4 rounds (any bids)
  - On round 5, tap a card so it lifts AND the drop-zone appears
  - Screenshot

### 3. End-screen (`screenshot-end.png`)
- **Viewport:** 1280×800
- **State:** End of a Vs AI game where you won decisively (~60-30)
- **Setup:**
  - Play Solo Vs AI on Easy with the 7-card deck (quicker game)
  - Win convincingly
  - Capture end screen showing result, score, analysis, score curve, coach insights all visible

### 4. Mobile in-game (`screenshot-mobile.png`)
- **Viewport:** 375×812 (iPhone-ish)
- **State:** Mid-game with all visible elements: header, prize, bids area, hand wrapped to 2 rows
- **Capture method:**
  - Chrome DevTools → Toggle device toolbar → iPhone SE / 12 / 13 preset
  - Or actual phone screen recording → screenshot one frame

### 5. Party room lobby (`screenshot-party.png`)
- **Viewport:** 1280×800
- **State:** Party room with 3 connected players in the roster
- **How:** open 3 browser windows / tabs (or one browser + 2 incognito), have all 3 connect to the same code. Screenshot the host's lobby showing all three players.

### 6. Bullet timer about to expire (`screenshot-bullet.png`)
- **State:** Bullet mode, timer at 1-2 seconds remaining, hand visible
- **Why:** dramatic, gets people curious about the speed mode

---

## How to take great screenshots

### Get clean Chrome DevTools captures
1. **F12** → toggle device mode
2. Set "Responsive" → custom dimensions
3. Three-dot menu → **Capture screenshot** (full page) or **Capture node screenshot** (one element)
4. No need to manually crop browser chrome

### Get clean macOS captures
- **Cmd-Shift-4** → drag selection (no browser chrome)
- **Cmd-Shift-4 → Spacebar** → click a window (clean window capture with shadow)

### Get clean Windows captures
- **Win-Shift-S** → drag selection

### Polish (optional, 5 min in any free tool)
- [Cleanshot](https://cleanshot.com) — paid, but worth it if you do this often
- [Carbon](https://carbon.now.sh) — for code snippets
- [Polypane](https://polypane.app) — multi-device screenshot tool

---

## File naming + repo location

Put final PNGs in `press/` next to this guide.

```
press/
  screenshot-lobby.png       1280×800
  screenshot-game.png        1280×800
  screenshot-end.png         1280×800
  screenshot-mobile.png      375×812
  screenshot-party.png       1280×800
  screenshot-bullet.png      1280×800
  og-image.png               1200×630 (Open Graph)
  twitter-card.png           1200×675 (optional, can reuse og-image)
```

After capturing, commit them to `press/` so they're versioned.

---

## Animated GIF (one of these, then embed in README)

For the main README, an animated GIF showing **one complete game round** (8-12s, looped) is more compelling than 5 screenshots.

### Free GIF capture tools

- **Mac:** [Kap](https://getkap.co) — beautiful, free, optimizes output well
- **Windows:** [ScreenToGif](https://www.screentogif.com) — free, light
- **Linux:** [Peek](https://github.com/phw/peek)
- **Cross-platform online:** [Veed.io](https://www.veed.io) → convert MP4 to GIF

### What to capture in the GIF

8-12 seconds total. Frame rate 12fps (keeps file size reasonable).

1. Lobby visible (~1s)
2. Click "Vs AI" → game loads (~1s)
3. Prize card flips into place (~1s)
4. Click a card → it lifts, drop-zone appears (~2s)
5. Click drop-zone → both bids reveal (~2s)
6. You win the round, score updates (~2s)
7. Next round starts (~1s)
8. Loop

### Size targets

- **Max 5 MB** so it loads quickly in README
- **Width 720px** is plenty for a README — don't oversize

Save as `press/demo.gif` and reference in the main `README.md`:

```markdown
![GOPS demo](./press/demo.gif)
```

---

## After capturing, update these files

- [ ] `README.md` — add `![](./press/demo.gif)` at the top, or 3 screenshots side-by-side
- [ ] `index.html` — update `<meta property="og:image">` to `press/og-image.png`
- [ ] **Bluesky / Twitter / Threads / LinkedIn** — upload screenshots when you post

---

## Don't bother with

- **Mockups in fake device frames** (the iPhone in 3D photoshop look). Looks salesy. Real screenshots convert better.
- **Stock photos of "hands playing cards"**. Off-brand. Use the actual game.
- **Watermarking your screenshots**. They're free to copy — that's the whole point.
