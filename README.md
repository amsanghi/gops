# GOPS

**Game of Pure Strategy** — a no-luck card duel. Bid `A`–`K` to win prizes; the highest total wins.

🎮 **Play now → [amsanghi.github.io/gops](https://amsanghi.github.io/gops)**

A static, zero-build progressive web app. No backend. No accounts. All state lives in your browser's `localStorage`. Multiplayer uses peer-to-peer WebRTC (via [PeerJS](https://peerjs.com/)) so games happen directly between players' devices. A single anonymous page-view counter ticks up in the lobby footer — no cookies, no IP storage, no PII.

---

## Highlights

- **13 solo modes** — Daily Deal, Vs AI, Hot Seat, Puzzles, Endless, Tournament, Bullet (3s/bid), AI Battle (spectate), Past Deals, Random Rules, Ghost, Practice, Weekly Puzzle.
- **Multiplayer** — Duel (1v1) **and** Party rooms (2–8 players) with text chat, emoji reactions, voice & video chat (when enabled). Mid-game refresh just works — both sides reconnect to the saved round automatically. Duel supports best-of 1/3/5/7/9 **and an indefinite series** that keeps a running tally.
- **Power cards variant** — Optional wildcard `★` worth the average prize value.
- **Coach mode** — Post-game analysis flags the rounds where you misplayed, with reasoning.
- **Replay tools** — Scrub through any past game; share replays via URL; download as `webm` video.
- **Stats & heatmaps** — Per-mode records, bid heatmap (what cards you favor against which prizes), score curves, AI mastery.
- **Customization** — 6 table felts (emerald, claret, midnight, cognac, slate, aubergine), 4 card backs, 22 avatars.
- **Onboarding** — In-game tutorial; post-tutorial guided first match with inline hints; built-in **About GOPS** modal with curated YouTube + text rules so newcomers can grok the game in 90 seconds.
- **Feedback hub** — One-tap deep links from the lobby to file bugs, suggest features, submit puzzles, or open a Discussion on GitHub.
- **Tap-to-confirm bidding** — Tap a card to stage it, tap again (or the drop-zone) to lock in. Keyboard shortcuts work too.
- **PWA** — Installable, offline-capable, share-target enabled.

## Tech

- Pure browser ESM — no build, no bundler, no transpile. Just open `index.html`.
- ~5300 lines across 18 small modules in [`js/`](./js/).
- Service worker with network-first HTML + stale-while-revalidate assets.
- In-browser test suite at [`/tests/`](./tests/).
- Uses PeerJS at runtime for multiplayer; lazy-loaded only when needed. WebRTC ICE with STUN + Open Relay TURN for NAT traversal.
- Dark only. The palette is green baize, brass, ivory and lacquer; type is Bodoni Moda over Jost. Swapping the felt is a `[data-theme]` block in `styles.css`.

## How to play

1. Each player has the cards A–K (or whatever deck size is set).
2. A prize deck of A–K is shuffled face down.
3. Each round, the top prize is revealed.
4. Every player **secretly** picks one card from their hand.
5. Highest bid wins the prize (low-bid-wins is an option). Ties carry the prize over (or burn / split, configurable).
6. After all rounds, whoever has the highest total wins. Spent cards are gone forever.

That's it. There's no randomness in your hand. It's all about prediction, bluffing, and patience.

## Modes at a glance

| Mode | What it is |
|---|---|
| Daily Deal | Same seeded shuffle for everyone today. Compare scores. |
| Vs AI | Quick game against the AI with picked difficulty + personality. |
| Hot Seat | Two people pass one device, secret bids each round. |
| Duel | 1v1 over PeerJS with text/voice/video chat. Refresh-safe. |
| Party Room | 2–8 players over PeerJS with text/voice/video chat. |
| Puzzles | Scripted scenarios with specific objectives. |
| Endless | Survival ladder of escalating difficulty. |
| Tournament | Beat 8 themed AIs in sequence to become champion. |
| Bullet | 3-second timer per bid. |
| AI Battle | Watch two AI personalities play. |
| Random Rules | Randomized deck / tie / direction / goal each game. |
| Ghost | Play against your highest-scoring solo game. |
| Practice | Solo with opponent's hand revealed (learning mode). |
| Weekly Puzzle | Same seeded shuffle for the whole week. |

## Keyboard shortcuts

- `1`–`9`, `0`, `J`, `Q`, `K`, `A` — bid that card
- `P` / `*` — bid your Power card (if enabled)
- `Enter` — lock in / quick rematch on end screen
- `Esc` — cancel pending bid / close modal

## Local development

```bash
# any static file server works
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

Run the test suite at `http://localhost:8000/tests/`.

## Contributing

Yes please! See **[CONTRIBUTING.md](./CONTRIBUTING.md)**. The simplest contributions are:

- 🐛 [File a bug](https://github.com/amsanghi/gops/issues/new?template=bug.yml)
- 💡 [Suggest a feature](https://github.com/amsanghi/gops/issues/new?template=feature.yml)
- 🧩 Add a puzzle to [`js/constants.js`](./js/constants.js) — just append a new entry to `PUZZLES`.
- 🎭 Add an AI personality / catchphrase — `AI_CATCHPHRASES` in the same file.
- 🎨 Build a new theme — add to `THEMES` and `[data-theme="..."]` in [`styles.css`](./styles.css).
- 📖 Improve this README.

PRs welcome. No build step, no framework, no friction.

## License

[MIT](./LICENSE) — do what you want with it.

## Credits

Game design: GOPS is a classic 1920s parlor card game (also known as *Goofspiel*).
Implementation: built collaboratively by [Aman Sanghi](https://github.com/amsanghi) and [Claude](https://claude.com/claude-code).
