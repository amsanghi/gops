# Launch day playbook (start here)

A literal step-by-step. Tick boxes as you go.

> 🎯 Goal: post the launch in **under 60 minutes total** of active work today.

---

## ☑ Pre-launch (30 min — do once)

### Accounts (skip the ones you have)
- [ ] **X / Twitter**: https://twitter.com/signup
  - Handle: `@yourname_gops` or `@yourname` if available
  - Bio: *"Building GOPS — a no-luck card duel. amsanghi.github.io/gops"*
- [ ] **Bluesky**: https://bsky.app — same bio
- [ ] **Threads**: same as Instagram
- [ ] **Reddit**: confirm your account has 30+ karma; new accounts get auto-filtered in many subs. If new, comment on a few posts in r/AskReddit first.
- [ ] **Product Hunt**: https://www.producthunt.com — create account *now*, wait 7 days before launching there (PH penalizes new accounts launching immediately)
- [ ] **YouTube**: confirm or create a channel under your name
- [ ] **TikTok**: optional — only do this if you want to record reels
- [ ] **Instagram**: optional — same

### Profile setup
- [ ] Add a profile pic (your face, or the GOPS logo SVG)
- [ ] Pin a launch tweet (you'll write it shortly)
- [ ] Add to bio: link to `https://amsanghi.github.io/gops`

### Repo polish
- [ ] **Add a release** on GitHub: `gh release create v1.0.0 --title "GOPS v1.0" --notes "First public release"`
- [ ] Take **3 screenshots** for the README — see [`screenshots-guide.md`](./screenshots-guide.md)
- [ ] Open the [`og-image.html`](./og-image.html) page in a browser, screenshot at 1200×630, commit as `press/og-image.png`
- [ ] Update `index.html` `<meta property="og:image">` to point to that PNG
- [ ] Add a screenshot or animated GIF at the top of the main README

### One asset to record (10 min)
- [ ] One 30-second screen recording of a Vs AI game — see Script 1 in [`video-scripts.md`](./video-scripts.md)
- [ ] Add captions in CapCut or similar
- [ ] Save in three aspect ratios: 9:16 (Reels), 1:1 (Instagram feed), 16:9 (Twitter card)

---

## ☑ Launch day (60 min active work)

### Phase 1: 9:00 AM ET — Twitter / X / Bsky / Threads / Mastodon (10 min)

- [ ] Post the **main launch tweet** (use Variant A from [`social-copy.md`](./social-copy.md))
- [ ] Post the same text on **Bluesky**, **Threads**, **Mastodon**
- [ ] Post the **30s reel** to **Instagram Reels**, **TikTok**, **YouTube Shorts**
- [ ] **Pin** the Twitter post

### Phase 2: 11:00 AM ET — Reddit (20 min)

- [ ] Post to **r/WebGames** (text post — use the longer variant)
- [ ] Post to **r/boardgames**
- [ ] **Don't** post to r/programming today — save it for Wednesday's Show HN day
- [ ] Reply to every comment that arrives in the first hour

### Phase 3: Lunch (browse + reply)

- [ ] Watch for replies, reply to every one
- [ ] If any comments contain bugs, file an issue — show that you respond to feedback
- [ ] Engage with anyone who shared / RTed

### Phase 4: 4:00 PM ET — afternoon push (10 min)

- [ ] Post to **LinkedIn** with the longer-form professional copy
- [ ] Comment on **3 existing GOPS YouTube videos** — see [`engagement-strategy.md`](./engagement-strategy.md)

### Phase 5: Evening (15 min)

- [ ] Last check: reply to any pending comments
- [ ] Note which platform got the most engagement — focus tomorrow there
- [ ] Set tomorrow's reminder: "Day 2 — Hacker News Show HN at 11 AM ET"

---

## ☑ Day 2-7 (refer to [`content-calendar.md`](./content-calendar.md))

---

## "What if it doesn't take off"

Most launches don't go viral. That's fine. Here's the realistic playbook:

1. **Don't delete posts.** Old posts get found via search for months.
2. **Keep playing the daily challenge yourself**, screenshot the share grid, post it. Your own consistency builds the audience.
3. **Reply to GOPS / Goofspiel mentions** in real time — set up a Google Alert for "goofspiel" and "game of pure strategy"
4. **Submit to weekly newsletters** — TLDR, IndieHackers Weekly, JavaScript Weekly, Webdesigner News
5. **Add features players ask for** — when someone asks for X in an issue, build it, then post about it
6. **Six months from now**, GOPS will be a top-3 Google result for "play goofspiel online" if you consistently update + the page stays live. That's where the long-term snowball comes from.

---

## "I don't have time today"

Minimum-viable launch in **15 minutes**:

1. **Tweet** Variant A from social-copy.md (3 min)
2. **Post to r/WebGames** with the long text variant (5 min)
3. **Comment on the top GOPS YouTube video** linking yours (2 min)
4. **Set a reminder** to do the rest tomorrow

That's it. You'll get *some* signups today. Build from there.

---

## "I want to do this with a bigger team / agency"

Don't. Solo indie launches with authentic voice beat agency-produced launches every time in 2026. The platforms (TikTok, Reddit) actively de-rank content that looks "manufactured." Your weird hand-typed-captions phone recording will outperform a $5000 ad campaign.

---

## After 30 days: what to measure

| Metric | How to check | Reasonable |
|---|---|---|
| GitHub stars | repo page | 50+ |
| Daily uniques | Plausible / browser logs | 50-200 |
| Twitter followers gained | profile | 30-100 |
| Reddit posts > 100 upvotes | post history | 1-3 |
| Cold incoming emails about the project | inbox | 1-3 |

If you have ≥3 from this list after a month, you're on track. Compound from here for 6 more months and you're a real thing.
