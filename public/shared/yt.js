/*
 * YT — a thin wrapper around the YouTube Playables SDK (window.ytgame).
 *
 * Inside YouTube Playables every call goes to the real SDK. Everywhere else
 * (the portal website, local dev) it falls back to browser equivalents so the
 * exact same build runs in both places:
 *   - save/load        -> ytgame.game.saveData/loadData   | localStorage
 *   - pause/resume     -> ytgame.system.onPause/onResume  | visibilitychange
 *   - audio toggle     -> ytgame.system.onAudioEnabledChange | always on
 *   - interstitial ads -> ytgame.ads.requestInterstitialAd | no-op
 *   - rewarded ads     -> ytgame.ads.requestRewardedAd    | demo overlay
 *
 * The SDK script (https://www.youtube.com/game_api/v1) is only added to the
 * YouTube builds (scripts/package.mjs); the website never loads it. Certification rules this wrapper helps with:
 *   - firstFrameReady() before gameReady(), each called exactly once
 *   - no browser storage inside Playables (cloud save only, <= 3 MiB)
 *   - pause all gameplay and audio on onPause
 *   - only grant a reward after the rewarded ad resolves successfully
 */
(function () {
  'use strict';

  const sdk = window.ytgame;
  const inPlayables = !!(sdk && sdk.IN_PLAYABLES_ENV);
  const MAX_SAVE_BYTES = 3 * 1024 * 1024;
  const INTERSTITIAL_GAP_MS = 60 * 1000;
  // Every SDK promise is raced against a timeout so a host that never answers
  // (e.g. the SDK loaded outside YouTube) can't leave the game stuck.
  const SDK_TIMEOUT_MS = 3000;
  const AD_TIMEOUT_MS = 90 * 1000;
  function withTimeout(promise, ms, what) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(what + ' timed out')), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  let gameId = 'game';
  let firstFrameSent = false;
  let readySent = false;
  let lastInterstitial = 0;
  let adOpen = false;
  let cloudReadOk = false;
  let audioOn = true;
  const listeners = { pause: [], resume: [], audio: [] };

  function emit(type, arg) {
    for (const fn of listeners[type]) {
      try { fn(arg); } catch (e) { logError(e); }
    }
  }

  function logError(e) {
    console.error(e);
    if (inPlayables) {
      try { sdk.health.logError(); } catch (_) { /* ignore */ }
    }
  }

  function logWarning(msg) {
    console.warn(msg);
    if (inPlayables) {
      try { sdk.health.logWarning(); } catch (_) { /* ignore */ }
    }
  }

  window.addEventListener('error', (ev) => logError(ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason));

  // --- system hooks -------------------------------------------------------
  if (inPlayables) {
    try {
      sdk.system.onPause(() => emit('pause'));
      sdk.system.onResume(() => emit('resume'));
      audioOn = !!sdk.system.isAudioEnabled();
      sdk.system.onAudioEnabledChange((enabled) => {
        audioOn = !!enabled;
        emit('audio', audioOn);
      });
    } catch (e) {
      logError(e);
    }
  } else {
    document.addEventListener('visibilitychange', () => {
      if (adOpen) return;
      emit(document.hidden ? 'pause' : 'resume');
    });
  }

  // --- demo ad overlay (website only) --------------------------------------
  function demoAd(kind) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'yt-demo-ad';
      wrap.innerHTML =
        '<div class="yt-demo-ad__box">' +
        '<div class="yt-demo-ad__tag">' + (kind === 'rewarded' ? 'Rewarded ad' : 'Ad break') + ' · demo</div>' +
        '<div class="yt-demo-ad__title">Your ad here</div>' +
        '<p>On YouTube Playables a real ad plays here. On this site it is simulated.</p>' +
        '<div class="yt-demo-ad__bar"><i></i></div>' +
        '<div class="yt-demo-ad__row">' +
        '<button type="button" data-act="close">Skip</button>' +
        '<button type="button" data-act="claim" disabled>Wait…</button>' +
        '</div></div>';
      document.body.appendChild(wrap);
      const claim = wrap.querySelector('[data-act="claim"]');
      const bar = wrap.querySelector('.yt-demo-ad__bar i');
      const total = kind === 'rewarded' ? 2500 : 1200;
      const start = performance.now();
      let done = false;
      const tick = () => {
        if (done) return;
        const p = Math.min(1, (performance.now() - start) / total);
        bar.style.width = (p * 100).toFixed(1) + '%';
        if (p < 1) requestAnimationFrame(tick);
        else {
          claim.disabled = false;
          claim.textContent = kind === 'rewarded' ? 'Claim reward' : 'Continue';
        }
      };
      requestAnimationFrame(tick);
      const finish = (ok) => {
        done = true;
        wrap.remove();
        resolve(ok);
      };
      wrap.querySelector('[data-act="close"]').addEventListener('click', () => finish(false));
      claim.addEventListener('click', () => finish(true));
    });
  }

  // --- public API -----------------------------------------------------------
  const YT = {
    inPlayables,

    init(id) {
      gameId = id;
      return YT;
    },

    firstFrameReady() {
      if (firstFrameSent) return;
      firstFrameSent = true;
      if (inPlayables) {
        try { sdk.game.firstFrameReady(); } catch (e) { logError(e); }
      }
    },

    gameReady() {
      YT.firstFrameReady();
      if (readySent) return;
      readySent = true;
      if (inPlayables) {
        try { sdk.game.gameReady(); } catch (e) { logError(e); }
      }
    },

    async load() {
      let raw = '';
      try {
        if (inPlayables) raw = await withTimeout(sdk.game.loadData(), SDK_TIMEOUT_MS, 'loadData');
        else raw = localStorage.getItem('ytp:' + gameId) || '';
        cloudReadOk = true;
      } catch (e) {
        // Start fresh, but don't let a fresh save overwrite progress we
        // simply couldn't read in time.
        logWarning('load failed: ' + e);
        return {};
      }
      try {
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        logWarning('corrupt save ignored: ' + e);
        return {};
      }
    },

    async save(data) {
      try {
        const raw = JSON.stringify(data);
        if (raw.length * 2 > MAX_SAVE_BYTES) {
          logWarning('save skipped: payload too large');
          return;
        }
        if (inPlayables && !cloudReadOk) {
          logWarning('save skipped: cloud save was never read');
          return;
        }
        if (inPlayables) await withTimeout(sdk.game.saveData(raw), SDK_TIMEOUT_MS, 'saveData');
        else localStorage.setItem('ytp:' + gameId, raw);
      } catch (e) {
        logWarning('save failed: ' + e);
      }
    },

    async language() {
      try {
        if (inPlayables) return await withTimeout(sdk.system.getLanguage(), SDK_TIMEOUT_MS, 'getLanguage');
      } catch (e) { logWarning(e); }
      return navigator.language || 'en';
    },

    onPause(fn) { listeners.pause.push(fn); },
    onResume(fn) { listeners.resume.push(fn); },
    onAudioChange(fn) { listeners.audio.push(fn); },
    audioEnabled() { return audioOn; },

    sendScore(value) {
      const v = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value || 0)));
      if (inPlayables) {
        try { sdk.engagement.sendScore({ value: v }); } catch (e) { logWarning(e); }
      }
    },

    /** Show an interstitial at a natural break. Rate-limited; never rejects. */
    async interstitial() {
      const now = Date.now();
      if (adOpen || now - lastInterstitial < INTERSTITIAL_GAP_MS) return;
      lastInterstitial = now;
      if (!inPlayables) return; // no forced ads on the website
      adOpen = true;
      emit('pause');
      try {
        await withTimeout(sdk.ads.requestInterstitialAd(), AD_TIMEOUT_MS, 'interstitial');
      } catch (e) {
        logWarning('interstitial unavailable: ' + e);
      } finally {
        adOpen = false;
        emit('resume');
      }
    },

    /**
     * Ask for a rewarded ad. Resolves true only if the reward should be
     * granted. Callers must grant the reward after this resolves, never before.
     */
    async rewarded(rewardId) {
      if (adOpen) return false;
      adOpen = true;
      emit('pause');
      let ok = false;
      try {
        if (inPlayables) {
          const r = await withTimeout(sdk.ads.requestRewardedAd(rewardId), AD_TIMEOUT_MS, 'rewarded ad');
          ok = r === undefined ? true : !!r;
        } else {
          ok = await demoAd('rewarded');
        }
      } catch (e) {
        logWarning('rewarded ad unavailable: ' + e);
        ok = false;
      } finally {
        adOpen = false;
        emit('resume');
      }
      return ok;
    },

    logError,
    logWarning,

    /** Lifecycle flags, used by the smoke tests. */
    status() {
      return { firstFrame: firstFrameSent, ready: readySent };
    },
  };

  window.YT = YT;
})();
