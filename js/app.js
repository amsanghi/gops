// Entry point. Wires modules together and handles init.

import { S, on } from './state.js';
import { $, $$, show, hide, confirmDialog, copyToClipboard } from './util.js';
import { THEMES } from './constants.js';
import {
  getPrefs, savePrefs, getSavedGame, clearSavedGame,
} from './storage.js';
import {
  setTheme, buildThemePicker, setupAvatarPicker,
  updateH2H, refreshLobbySubtitles, setupModals, openAchievementsModal, openStatsModal,
  openPuzzleModal, openTournamentModal, openHotSeatPrompt, showResumeBanner,
  openArchiveModal, openBattleModal,
  renderEnd, buildReactionsBar, toggleChat, sendChat, renderChatMsgs,
  applyStreakFrame,
} from './ui.js';
import { getDailyState } from './storage.js';
import { renderHistory } from './render.js';
import { sfx, haptic } from './effects.js';
import {
  setupGame, applySaveSnap, setNetSender, setEndHook, compareScores,
  confirmPick, selectCard,
} from './game.js';
import { configureMulti, startHost, joinGame, sendQuit, cleanup as cleanupMulti, cleanupIntentional as cleanupMultiIntentional, beginHostedMatch, setRematchHook } from './multi.js';
import {
  configureMultiN, startPartyHost, joinPartyRoom, startPartyGame, cleanupParty,
  startMic, stopMic,
} from './multiN.js';
import { getMultiSession, clearMultiSession, migrateStorage } from './storage.js';
import {
  startSolo, startDaily, startEndless, startTournamentMatch, startNextTournamentMatch,
  progressTournament, progressEndless, progressPuzzle, progressDaily, startNextEndlessRound,
  startTutorial, startHotSeat, startGhost, startBullet, startBattle,
  startPractice, startSeeded, startWeekly, startBracket, startRandomRule,
} from './modes.js';
import {
  copyDailyResult, copyAnyResult, shareImage, copyChallengeLink, parseChallengeLink,
  exportData, importData, exportHistoryCSV, copyReplayURL, parseReplayLink,
  shareStatsImage, recordReplayVideo,
} from './share.js';

// ---- Net sender (defined here to mediate between game.js and multi.js) ----
function netSend(msg) {
  if (S.conn && S.conn.open) {
    try { S.conn.send(msg); } catch (e) { console.error('send failed', e); }
  }
}
setNetSender(netSend);

// ---- End screen hook ----
setEndHook(({ didIWin, seriesOver, cmp }) => {
  renderEnd({ didIWin, seriesOver, cmp });

  // Mode-specific progression flags applied AFTER render so labels stay accurate
  if (S.currentMode === 'daily') progressDaily(didIWin);
  if (S.currentMode === 'tournament' && didIWin) progressTournament(didIWin);
  if (S.currentMode === 'endless' && didIWin) progressEndless(didIWin);
  if (S.currentMode === 'puzzle' && didIWin) progressPuzzle(didIWin);
});

// ---- Rematch flow ----
setRematchHook(() => {
  if (S.myRematch && S.theirRematch) {
    if (S.isHost) beginHostedMatch();
    else $('rematch-status').textContent = 'Starting…';
  } else if (S.theirRematch && !S.myRematch) {
    $('rematch-status').textContent = `${S.theirName} wants a rematch!`;
  } else if (S.myRematch && !S.theirRematch) {
    $('rematch-status').textContent = `Waiting for ${S.theirName}…`;
  }
});

// ---- Multi callbacks ----
configureMulti({
  onLobbyError: msg => { $('lobby-err').textContent = msg; },
  onReturnToLobby: showLobby,
  onGameStart: () => { /* handled by setupGame */ },
  onChatBadge: hasUnread => {
    const btn = $('chat-btn');
    if (hasUnread) btn.setAttribute('data-badge', '1');
    else btn.removeAttribute('data-badge');
  },
  onChatMessage: renderChatMsgs,
});

// Open a shared replay on the end screen (no game played, just history scrubbing).
function openSharedReplay(r) {
  S.settings = {
    deckSize: r.deckSize, bestOf: 1, tieRule: r.tieRule,
    direction: r.direction, winCondition: r.winCondition, timeLimit: 0, stakes: '',
  };
  S.totalRounds = r.deckSize;
  S.myName = r.myName; S.theirName = r.theirName;
  S.prizes = r.prizes;
  S.history = [];
  // Reconstruct round records
  let pot = 0;
  for (let i = 0; i < r.prizes.length; i++) {
    const mine = r.myBids[i], theirs = r.theirBids[i];
    const value = r.prizes[i] + pot;
    let winner;
    const cmp = r.direction === 'low' ? theirs - mine : mine - theirs;
    if (cmp > 0) { winner = 'me'; pot = 0; }
    else if (cmp < 0) { winner = 'them'; pot = 0; }
    else { winner = 'tie'; pot = r.tieRule === 'burn' ? 0 : value; }
    S.history.push({ round: i + 1, prize: r.prizes[i], mine, theirs, prizeValue: value, winner });
  }
  // Compute final scores from history
  S.myScore = S.history.filter(h => h.winner === 'me').reduce((a, h) => a + h.prizeValue, 0);
  S.theirScore = S.history.filter(h => h.winner === 'them').reduce((a, h) => a + h.prizeValue, 0);
  S.currentMode = 'replay'; S.vsAI = true;
  hide('lobby');
  show('end');
  const cmp = (r.winCondition === 'fewest') ? S.theirScore - S.myScore : S.myScore - S.theirScore;
  renderEnd({ didIWin: cmp > 0, seriesOver: true, cmp });
  // Mark this isn't a real game played; disable rematch and update label
  $('rematch-btn').textContent = '← Back to lobby';
  $('rematch-btn').onclick = () => { hide('end'); show('lobby'); };
}

// ---- Onboarding (first visit) ----
function setupOnboarding() {
  const p = getPrefs();
  if (p.seen) return;
  const onb = $('onboarding');
  onb.hidden = false;
  $('onb-dismiss').onclick = () => { onb.hidden = true; savePrefs({ seen: true }); };
  $('onb-tutorial').onclick = () => { onb.hidden = true; savePrefs({ seen: true }); startTutorial(startSolo); };
  $('onb-about').onclick = () => { onb.hidden = true; savePrefs({ seen: true }); show('modal-about'); };
}

// ---- AI Bracket ----
function openBracketModal() {
  show('modal-bracket');
  $('bracket-results').innerHTML = '';
  $('bracket-run-btn').onclick = () => {
    startBracket(({ champion, log }) => {
      const html = log.map(stage => `
        <div class="bracket-stage">
          <div class="bracket-stage-name">${stage.round}</div>
          ${stage.matches.map(m => `
            <div class="bracket-match">
              <div class="bm-a ${m.winner === m.a ? 'win' : ''}">${m.a}</div>
              <div class="bm-score">${m.sA} – ${m.sB}</div>
              <div class="bm-b ${m.winner === m.b ? 'win' : ''}">${m.b}</div>
            </div>
          `).join('')}
        </div>
      `).join('');
      $('bracket-results').innerHTML = html + `<div class="bracket-champion">👑 Champion: ${champion}</div>`;
    });
  };
}

// ---- Lobby helpers ----
function showLobby() {
  hide('game'); hide('end');
  show('lobby');
  show('lobby-default');
  hide('host-info'); hide('join-info');
  const partyInfo = document.getElementById('party-info');
  if (partyInfo) partyInfo.hidden = true;
  document.body.classList.remove('in-game', 'bullet');
  $('lobby-err').textContent = '';
  S.mode = null; S.currentMode = null;
  S.scriptedAI = null;
  refreshLobbySubtitles();
}

// ---- Rematch click ----
function requestRematch() {
  if (S.myRematch) return;
  S.myRematch = true;
  $('rematch-btn').disabled = true;
  $('rematch-btn').textContent = 'Loading…';

  if (S.currentMode === 'tournament') { hide('end'); startNextTournamentMatch(); return; }
  if (S.currentMode === 'endless')    { hide('end'); startNextEndlessRound(); return; }
  if (S.currentMode === 'puzzle')     { hide('end'); showLobby(); openPuzzleModal(); return; }
  if (S.currentMode === 'daily')      { hide('end'); showLobby(); return; }
  if (S.currentMode === 'hotseat')    { hide('end'); openHotSeatPrompt(startHotSeat); return; }
  if (S.currentMode === 'ghost')      { hide('end'); startGhost() || showLobby(); return; }
  if (S.vsAI)                         { S.theirRematch = true; hide('end'); setupGame(); return; }
  // Multiplayer
  netSend({ type: 'rematch' });
  // Check whether opponent already requested
  if (S.theirRematch) {
    if (S.isHost) beginHostedMatch();
  } else {
    $('rematch-status').textContent = `Waiting for ${S.theirName}…`;
  }
}

// ---- Quit ----
async function quitGame() {
  const ok = await confirmDialog({
    title: 'Quit game?',
    message: 'Your progress in this match will be discarded.',
    confirm: 'Quit',
    cancel: 'Stay',
    danger: true,
  });
  if (!ok) return;
  if (!S.vsAI && S.currentMode === 'multi') sendQuit();
  clearSavedGame();
  cleanupMultiIntentional();
  showLobby();
}

// ---- Multi refresh-rejoin ----
// If the player was in a multiplayer session within the last 10 minutes, offer to reconnect.
function tryRejoinMulti() {
  const s = getMultiSession();
  if (!s) return;
  if (Date.now() - (s.ts || 0) > 10 * 60 * 1000) { clearMultiSession(); return; }
  showRejoinBanner(s);
}

function showRejoinBanner(s) {
  let banner = document.getElementById('rejoin-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'rejoin-banner';
    banner.className = 'resume';
    const resumeEl = document.getElementById('resume');
    resumeEl.parentNode.insertBefore(banner, resumeEl.nextSibling);
  }
  const ago = Math.round((Date.now() - s.ts) / 1000);
  const agoText = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
  banner.hidden = false;
  banner.innerHTML = `
    <div class="resume-text"><b>Rejoin ${s.mode === 'party' ? 'party' : 'duel'}?</b><span>Room <code>${s.code}</code> · as ${s.role} · ${agoText}</span></div>
    <div class="resume-actions">
      <button class="btn btn-ghost btn-sm" id="rejoin-discard">Discard</button>
      <button class="btn btn-primary btn-sm" id="rejoin-go">Rejoin</button>
    </div>
  `;
  document.getElementById('rejoin-discard').onclick = () => {
    banner.hidden = true; clearMultiSession();
  };
  document.getElementById('rejoin-go').onclick = () => {
    banner.hidden = true;
    if (s.name) { S.myName = s.name; document.getElementById('name-input').value = s.name; }
    if (s.avatar) { S.myAvatar = s.avatar; document.getElementById('avatar-btn').textContent = s.avatar; }

    // For HOST role: load the saved mid-game state so we can send it on reconnect.
    // The joiner doesn't need to load — they'll receive authoritative state from host.
    let midGameRejoin = false;
    if (s.role === 'host' && s.mode === 'duel') {
      const saved = getSavedGame();
      if (saved && saved.mode === 'host' && saved.currentMode === 'multi') {
        applySaveSnap(saved);
        S.isHost = true; S.currentMode = 'multi'; S.mode = 'host'; S.vsAI = false;
        midGameRejoin = true;
      }
    }

    if (s.mode === 'party') {
      if (s.role === 'host') {
        document.getElementById('host-code').value = s.code;
        document.querySelector('.mp-mode-btn[data-mode="party"]')?.click();
        startPartyHost();
      } else {
        joinPartyRoom(s.code);
      }
    } else {
      // duel
      document.getElementById('host-code').value = s.code;
      if (s.role === 'host') {
        document.querySelector('.mp-mode-btn[data-mode="duel"]')?.click();
        startHost({ rejoinExisting: midGameRejoin });
      } else {
        document.getElementById('join-code').value = s.code;
        joinGame();
      }
    }
  };
}

// ---- Resume ----
function tryResume() {
  const saved = getSavedGame();
  if (!saved) return;
  if (Date.now() - saved.timestamp > 24 * 60 * 60 * 1000) { clearSavedGame(); return; }
  // Solo banner only handles vs-AI. Multi snapshots are restored by tryRejoinMulti — leave them.
  if (saved.mode !== 'solo') return;
  showResumeBanner(saved, () => {
    applySaveSnap(saved);
    hide('resume');
    hide('lobby'); show('game');
    import('./game.js').then(g => g.nextRound());
  }, clearSavedGame);
}

// ---- Preferences ----
function loadPrefs() {
  const p = getPrefs();
  if (p.name) { S.myName = p.name; $('name-input').value = p.name; }
  if (p.theme) S.theme = p.theme;
  if (p.avatar) S.myAvatar = p.avatar;
  if (p.sound !== undefined) S.sound = !!p.sound;
  if (Array.isArray(p.themesTried)) S.themesTried = new Set(p.themesTried);
  if (p.coachMode !== undefined) S.coachMode = !!p.coachMode;
  setTheme(S.theme || 'mono');
  if (p.lastHost) {
    const ls = p.lastHost;
    ['deck','tie','dir','goal','time'].forEach(k => {
      const el = $('host-' + k);
      if (el && ls[k] !== undefined) el.value = ls[k];
    });
  }
  $('avatar-btn').textContent = S.myAvatar;
  // Reflect prefs in settings controls
  if ($('set-coach')) $('set-coach').value = S.coachMode === false ? '0' : '1';
  updateSoundBtn();
  applyStreakFrame();
}

function updateSoundBtn() {
  const btn = $('sound-btn');
  if (btn) btn.textContent = S.sound ? '♪' : '♪̸';
  $('set-sound').value = S.sound ? '1' : '0';
}

// ---- Keyboard shortcuts ----
function bindKeys() {
  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    // Quick rematch from end screen
    if (!$('end').hidden && e.key === 'Enter' && !$('rematch-btn').disabled) {
      e.preventDefault(); $('rematch-btn').click(); return;
    }
    if ($('game').hidden) return;
    if (S.myPick !== null) return;
    let n = null;
    if (e.key >= '1' && e.key <= '9') n = parseInt(e.key, 10);
    else if (e.key === '0') n = 10;
    else if (e.key.toLowerCase() === 'j') n = 11;
    else if (e.key.toLowerCase() === 'q') n = 12;
    else if (e.key.toLowerCase() === 'k') n = 13;
    else if (e.key.toLowerCase() === 'a') n = 1;
    else if (e.key === '*' || e.key === 'p' || e.key === 'P') {
      // Power card shortcut
      if (S.settings.powerCards && S.myHand.includes(99)) selectCard(99);
      return;
    }
    else if (e.key === 'Enter' && S.pendingPick !== null) { confirmPick(); return; }
    else if (e.key === 'Escape' && S.pendingPick !== null) {
      S.pendingPick = null;
      import('./render.js').then(r => r.renderHand(selectCard));
      $('confirm-row').innerHTML = '';
      return;
    }
    if (n !== null && S.myHand.includes(n) && n <= S.settings.deckSize) selectCard(n);
  });
}

// ---- Service worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---- Wire everything ----
function init() {
  // One-shot: rename old gops3-* keys → gops-* (preserves user data).
  migrateStorage();

  // Pickers / theme
  buildThemePicker();
  setupAvatarPicker();
  loadPrefs();
  setupModals();

  // Lobby
  parseChallengeLink();
  refreshLobbySubtitles();
  updateH2H();
  tryResume();
  tryRejoinMulti();

  // Replay link: if URL has #replay=..., open the end-screen scrubber on it.
  const replay = parseReplayLink();
  if (replay) openSharedReplay(replay);

  // Name input
  $('name-input').addEventListener('input', () => {
    S.myName = $('name-input').value.trim() || 'You';
    savePrefs({ name: S.myName });
    updateH2H();
  });

  // Mode tiles
  $('daily-tile').onclick = startDaily;
  $('solo-tile').onclick = startSolo;
  $('hotseat-tile').onclick = () => openHotSeatPrompt(startHotSeat);
  $('puzzle-tile').onclick = openPuzzleModal;
  $('endless-tile').onclick = startEndless;
  $('tournament-tile').onclick = openTournamentModal;
  $('bullet-tile').onclick = startBullet;
  $('battle-tile').onclick = () => openBattleModal((a, b, d) => startBattle(a, b, d));
  $('archive-tile').onclick = openArchiveModal;
  $('bracket-tile').onclick = openBracketModal;
  $('random-tile').onclick = startRandomRule;
  $('practice-tile').onclick = startPractice;
  $('weekly-tile').onclick = startWeekly;
  $('seed-go-btn').onclick = () => {
    const v = $('seed-date').value;
    if (!v) return;
    hide('modal-archive');
    startSeeded(v);
  };
  // Onboarding for first-time visitors
  setupOnboarding();

  // AI settings panel
  $('ghost-tile').onclick = () => {
    if (!startGhost()) {
      $('lobby-err').textContent = 'No ghost recorded yet — finish a solo win first.';
      setTimeout(() => { $('lobby-err').textContent = ''; }, 3000);
    }
  };

  // Multiplayer
  let mpMode = 'duel'; // or 'party'
  $$('.mp-mode-btn').forEach(btn => {
    btn.onclick = () => {
      mpMode = btn.dataset.mode;
      $$('.mp-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    };
  });
  $('create-btn').onclick = () => {
    if (mpMode === 'party') startPartyHost(); else startHost();
  };
  $('join-btn').onclick = () => {
    const code = ($('join-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (mpMode === 'party') joinPartyRoom(code); else joinGame();
  };
  $('join-code').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      const code = ($('join-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (mpMode === 'party') joinPartyRoom(code); else joinGame();
    }
  });
  $('host-cancel').onclick = () => { cleanupMultiIntentional(); showLobby(); };
  $('join-cancel').onclick = () => { cleanupMultiIntentional(); showLobby(); };
  $('copy-challenge-btn').onclick = copyChallengeLink;

  // Party controls
  const partyStartBtn = $('party-start-btn');
  if (partyStartBtn) partyStartBtn.onclick = startPartyGame;
  const partyCancel = $('party-cancel');
  if (partyCancel) partyCancel.onclick = () => { cleanupParty(true); showLobby(); };
  const partyCode = $('party-code');
  if (partyCode) partyCode.onclick = () => {
    navigator.clipboard?.writeText(partyCode.textContent).then(() => {
      const hint = $('party-copy-hint');
      if (hint) { const old = hint.textContent; hint.textContent = '✓ Copied!'; setTimeout(() => hint.textContent = old, 1200); }
    });
  };
  // Mic/cam buttons — same handlers wired to both the party lobby toolbar
  // and the in-game toolbar (game-mic-btn / game-cam-btn).
  const toggleMic = async () => {
    if (S.micOn) stopMic(); else await startMic(S.camOn);
    syncMediaBtns();
  };
  const toggleCam = async () => {
    if (S.camOn) stopMic();
    else await startMic(true);
    syncMediaBtns();
  };
  ['mic-btn', 'game-mic-btn'].forEach(id => { const b = $(id); if (b) b.onclick = toggleMic; });
  ['cam-btn', 'game-cam-btn'].forEach(id => { const b = $(id); if (b) b.onclick = toggleCam; });

  function syncMediaBtns() {
    ['mic-btn', 'game-mic-btn'].forEach(id => $(id)?.classList.toggle('on', S.micOn));
    ['cam-btn', 'game-cam-btn'].forEach(id => $(id)?.classList.toggle('on', S.camOn));
  }
  configureMultiN({
    onError: msg => { $('lobby-err').textContent = msg; },
    onReturnToLobby: showLobby,
  });

  // Top bar — light/dark toggle removed; site is dark-only.
  $('achievements-btn').onclick = openAchievementsModal;
  $('stats-btn').onclick = () => {
    openStatsModal();
    const snapBtn = $('snapshot-stats-btn');
    if (snapBtn && !snapBtn._wired) {
      snapBtn._wired = true;
      snapBtn.onclick = () => shareStatsImage();
    }
  };
  $('settings-btn').onclick = () => {
    $('set-sound').value = S.sound ? '1' : '0';
    show('modal-settings');
  };

  // Settings modal controls
  $('set-sound').onchange = e => { S.sound = e.target.value === '1'; savePrefs({ sound: S.sound }); updateSoundBtn(); if (S.sound) sfx.pick(); };
  $('set-coach').onchange = e => { S.coachMode = e.target.value === '1'; savePrefs({ coachMode: S.coachMode }); };
  $('import-btn').onclick = () => $('import-file').click();
  $('import-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    importData(f, (ok, err) => {
      if (ok) {
        confirmDialog({
          title: 'Data imported',
          message: 'Reload the page to apply.',
          confirm: 'Reload',
          cancel: 'Later',
        }).then(r => { if (r) location.reload(); });
      } else $('lobby-err').textContent = 'Import failed: ' + (err || '');
    });
  });
  $('export-btn').onclick = exportData;
  $('export-btn-2').onclick = exportData;
  $('reset-data-btn').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Reset all data?',
      message: 'Stats, achievements, history, and prefs will be erased. This cannot be undone.',
      confirm: 'Reset everything',
      cancel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    import('./storage.js').then(m => { m.wipeAll(); location.reload(); });
  };

  // Tutorial
  $('tutorial-btn').onclick = () => startTutorial(startSolo);

  // About modal (curated external resources) — also surfaced as a hero CTA
  $('about-btn').onclick = () => show('modal-about');
  $('hero-learn-btn').onclick = () => show('modal-about');
  $('about-tutorial-btn').onclick = () => { hide('modal-about'); startTutorial(startSolo); };

  // Feedback modal — bug/feature/puzzle/discussion deep-links to GitHub
  $('feedback-btn').onclick = () => show('modal-feedback');

  // Game toolbar
  $('history-btn').onclick = () => { renderHistory(); show('modal-history'); };
  $('history-btn-2').onclick = () => { renderHistory(); show('modal-history'); };
  $('export-csv-btn').onclick = exportHistoryCSV;
  $('sound-btn').onclick = () => { S.sound = !S.sound; savePrefs({ sound: S.sound }); updateSoundBtn(); if (S.sound) sfx.pick(); };
  $('quit-btn').onclick = quitGame;
  $('chat-btn').onclick = toggleChat;
  $('chat-send').onclick = () => sendChat(netSend);
  $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(netSend); });

  // End screen actions
  $('rematch-btn').onclick = requestRematch;
  $('back-to-lobby-btn').onclick = () => { cleanupMulti(); showLobby(); };
  $('share-img-btn').onclick = shareImage;
  $('share-text-btn').onclick = () => { S.currentMode === 'daily' ? copyDailyResult() : copyAnyResult(); };
  $('share-replay-btn').onclick = () => copyReplayURL(S);
  $('share-video-btn').onclick = async () => {
    const btn = $('share-video-btn');
    btn.disabled = true; btn.textContent = '⏺ Recording...';
    const ok = await recordReplayVideo(S.history, S.settings.deckSize);
    btn.disabled = false;
    btn.textContent = ok ? '✓ Saved' : '✗ Not supported';
    setTimeout(() => btn.textContent = '▶ Replay video', 1500);
  };
  $('coach-toggle').onclick = () => {
    const c = $('coach');
    const list = $('coach-list');
    list.hidden = !list.hidden;
    $('coach-toggle').textContent = list.hidden ? 'Show' : 'Hide';
  };

  // Archive day click → show 5-square grid in confirm modal (read-only view)
  $('archive-body')?.addEventListener('click', (e) => {
    const day = e.target.closest('.arc-day.done');
    if (!day) return;
    const k = day.dataset.date;
    const st = getDailyState();
    const rec = st.history[k];
    if (!rec) return;
    // We don't store the round-by-round grid for past dailies (only score), so just show summary
    confirmDialog({
      title: `Daily ${k}`,
      message: `Result: ${rec.won ? 'Win' : rec.theirScore === rec.myScore ? 'Tie' : 'Loss'} · ${rec.myScore} – ${rec.theirScore}`,
      confirm: 'OK',
      cancel: 'Close',
    });
  });

  // Keyboard
  bindKeys();

  // Reactions bar — built on every game attach because vsAI/multi can vary
  on('game-attached', () => buildReactionsBar(netSend));

  // Persist on unload
  window.addEventListener('beforeunload', () => {
    if (!$('game').hidden) {
      import('./game.js').then(() => { /* save already done after each round */ });
    }
  });

  // SW
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
