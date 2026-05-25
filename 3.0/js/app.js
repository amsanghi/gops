// Entry point. Wires modules together and handles init.

import { S, on } from './state.js';
import { $, $$, show, hide, confirmDialog, copyToClipboard } from './util.js';
import { THEMES } from './constants.js';
import {
  getPrefs, savePrefs, getSavedGame, clearSavedGame,
} from './storage.js';
import {
  setTheme, setMode, buildThemePicker, setupAvatarPicker, buildCardBackPicker,
  updateH2H, refreshLobbySubtitles, setupModals, openAchievementsModal, openStatsModal,
  openPuzzleModal, openTournamentModal, openHotSeatPrompt, showResumeBanner,
  openArchiveModal, openBattleModal,
  renderEnd, buildReactionsBar, toggleChat, sendChat, renderChatMsgs,
  applyStreakFrame, applyCustomTheme, applyAnimSpeed,
} from './ui.js';
import { getCustomTheme, saveCustomTheme, getDailyState } from './storage.js';
import { renderHistory } from './render.js';
import { sfx, haptic } from './effects.js';
import {
  setupGame, applySaveSnap, setNetSender, setEndHook, compareScores,
  confirmPick, selectCard,
} from './game.js';
import { configureMulti, startHost, joinGame, sendQuit, cleanup as cleanupMulti, beginHostedMatch, setRematchHook } from './multi.js';
import {
  startSolo, startDaily, startEndless, startTournamentMatch, startNextTournamentMatch,
  progressTournament, progressEndless, progressPuzzle, progressDaily, startNextEndlessRound,
  startTutorial, startHotSeat, startGhost, startBullet, startBattle,
} from './modes.js';
import {
  copyDailyResult, copyAnyResult, shareImage, copyChallengeLink, parseChallengeLink,
  exportData, importData, exportHistoryCSV, copyReplayURL, parseReplayLink,
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

// ---- Lobby helpers ----
function showLobby() {
  hide('game'); hide('end');
  show('lobby');
  show('lobby-default');
  hide('host-info'); hide('join-info');
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
  cleanupMulti();
  showLobby();
}

// ---- Resume ----
function tryResume() {
  const saved = getSavedGame();
  if (!saved) return;
  if (Date.now() - saved.timestamp > 24 * 60 * 60 * 1000) { clearSavedGame(); return; }
  showResumeBanner(saved, () => {
    applySaveSnap(saved);
    hide('resume');
    if (saved.mode === 'solo') {
      // Restart at next round from snapshot
      // We can't easily resume mid-round; round was already committed at save time
      hide('lobby'); show('game');
      // Best effort: rebuild UI as fresh round
      import('./game.js').then(g => g.nextRound());
    } else {
      $('lobby-err').textContent = `Multi resume isn't supported — reconnect with code ${saved.roomCode}.`;
    }
  }, clearSavedGame);
}

// ---- Preferences ----
function loadPrefs() {
  const p = getPrefs();
  if (p.name) { S.myName = p.name; $('name-input').value = p.name; }
  if (p.theme) S.theme = p.theme;
  if (p.avatar) S.myAvatar = p.avatar;
  if (p.cardBack) S.cardBack = p.cardBack;
  if (p.sound !== undefined) S.sound = !!p.sound;
  if (p.haptics !== undefined) S.haptics = !!p.haptics;
  if (Array.isArray(p.themesTried)) S.themesTried = new Set(p.themesTried);
  if (p.modeLight) S.mode_light = true;
  if (p.handSort) S.handSort = p.handSort;
  if (p.animSpeed) S.animSpeed = p.animSpeed;
  if (p.coachMode !== undefined) S.coachMode = !!p.coachMode;
  setTheme(S.theme || 'mono');
  if (p.modeLight) setMode('light');
  if (p.cbSafe) document.documentElement.setAttribute('data-cb', '1');
  applyAnimSpeed(S.animSpeed || 1);
  // Custom theme
  const ct = getCustomTheme();
  if (ct) applyCustomTheme(ct);
  if (p.lastHost) {
    const ls = p.lastHost;
    ['deck','tie','dir','goal','time'].forEach(k => {
      const el = $('host-' + k);
      if (el && ls[k] !== undefined) el.value = ls[k];
    });
  }
  $('avatar-btn').textContent = S.myAvatar;
  // Reflect prefs in settings controls
  if ($('set-handsort')) $('set-handsort').value = S.handSort;
  if ($('set-animspeed')) $('set-animspeed').value = String(S.animSpeed || 1);
  if ($('set-coach')) $('set-coach').value = S.coachMode === false ? '0' : '1';
  if ($('set-cbsafe')) $('set-cbsafe').value = p.cbSafe ? '1' : '0';
  if (ct) {
    if ($('set-accent')) $('set-accent').value = ct.accent || '#fafafa';
    if ($('set-opp')) $('set-opp').value = ct.opp || '#a1a1aa';
  }
  updateSoundBtn();
  applyStreakFrame();
}

function updateSoundBtn() {
  const btn = $('sound-btn');
  if (btn) btn.textContent = S.sound ? '♪' : '♪̸';
  $('set-sound').value = S.sound ? '1' : '0';
  $('set-haptics').value = S.haptics ? '1' : '0';
}

// ---- Keyboard shortcuts ----
function bindKeys() {
  window.addEventListener('keydown', e => {
    if ($('game').hidden) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (S.myPick !== null) return;
    let n = null;
    if (e.key >= '1' && e.key <= '9') n = parseInt(e.key, 10);
    else if (e.key === '0') n = 10;
    else if (e.key.toLowerCase() === 'j') n = 11;
    else if (e.key.toLowerCase() === 'q') n = 12;
    else if (e.key.toLowerCase() === 'k') n = 13;
    else if (e.key.toLowerCase() === 'a') n = 1;
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

// ---- PWA install ----
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  show('install-area');
});

// ---- Service worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---- Wire everything ----
function init() {
  // Pickers / theme
  buildThemePicker();
  setupAvatarPicker();
  buildCardBackPicker();
  loadPrefs();
  setupModals();

  // Lobby
  parseChallengeLink();
  refreshLobbySubtitles();
  updateH2H();
  tryResume();

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

  // AI settings panel
  $('ghost-tile').onclick = () => {
    if (!startGhost()) {
      $('lobby-err').textContent = 'No ghost recorded yet — finish a solo win first.';
      setTimeout(() => { $('lobby-err').textContent = ''; }, 3000);
    }
  };

  // Multiplayer
  $('create-btn').onclick = startHost;
  $('join-btn').onclick = joinGame;
  $('join-code').addEventListener('keypress', e => { if (e.key === 'Enter') joinGame(); });
  $('host-cancel').onclick = () => { cleanupMulti(); showLobby(); };
  $('join-cancel').onclick = () => { cleanupMulti(); showLobby(); };
  $('copy-challenge-btn').onclick = copyChallengeLink;

  // Top bar
  $('mode-toggle-btn').onclick = () => {
    const isLight = document.documentElement.getAttribute('data-mode') === 'light';
    setMode(isLight ? 'dark' : 'light');
    if (isLight) document.documentElement.removeAttribute('data-mode'); // back to auto/dark
  };
  $('achievements-btn').onclick = openAchievementsModal;
  $('stats-btn').onclick = openStatsModal;
  $('settings-btn').onclick = () => {
    buildCardBackPicker();
    $('set-sound').value = S.sound ? '1' : '0';
    $('set-haptics').value = S.haptics ? '1' : '0';
    show('modal-settings');
  };

  // Settings modal controls
  $('set-sound').onchange = e => { S.sound = e.target.value === '1'; savePrefs({ sound: S.sound }); updateSoundBtn(); if (S.sound) sfx.pick(); };
  $('set-haptics').onchange = e => { S.haptics = e.target.value === '1'; savePrefs({ haptics: S.haptics }); };
  $('set-handsort').onchange = e => { S.handSort = e.target.value; savePrefs({ handSort: e.target.value }); };
  $('set-animspeed').onchange = e => { S.animSpeed = parseFloat(e.target.value); applyAnimSpeed(S.animSpeed); savePrefs({ animSpeed: S.animSpeed }); };
  $('set-coach').onchange = e => { S.coachMode = e.target.value === '1'; savePrefs({ coachMode: S.coachMode }); };
  $('set-cbsafe').onchange = e => {
    const on = e.target.value === '1';
    if (on) document.documentElement.setAttribute('data-cb', '1');
    else document.documentElement.removeAttribute('data-cb');
    savePrefs({ cbSafe: on });
  };
  $('apply-custom-btn').onclick = () => {
    const accent = $('set-accent').value, opp = $('set-opp').value;
    saveCustomTheme({ accent, opp });
    applyCustomTheme({ accent, opp });
    savePrefs({ customTheme: { accent, opp } });
  };
  $('clear-custom-btn').onclick = () => {
    saveCustomTheme(null);
    applyCustomTheme(null);
    savePrefs({ customTheme: null });
  };
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
  $('install-btn').onclick = () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(() => { deferredInstall = null; hide('install-area'); });
  };

  // Tutorial
  $('tutorial-btn').onclick = () => startTutorial(startSolo);

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
