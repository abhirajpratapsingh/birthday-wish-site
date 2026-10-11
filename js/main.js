(function () {
  'use strict';

  const C = window.CONFIG;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const pad = n => String(n).padStart(2, '0');
  const rand = (a, b) => a + Math.random() * (b - a);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = C.texts;
  const S = C.settings;
  const SHOW = C.show;
  const COLORS = C.theme.confetti;

  // Fill {name}, {from}, {date} placeholders
  const fmt = str => String(str == null ? '' : str)
    .replace(/\{name\}/g, C.person.name)
    .replace(/\{from\}/g, C.person.from)
    .replace(/\{date\}/g, C.event.dateLabel);
  const t = key => fmt(T[key]);

  // Put every [data-t] text from config into the page. {name} gets the fancy script font.
  function applyTexts(root) {
    $$('[data-t]', root).forEach(el => {
      const raw = T[el.dataset.t];
      if (raw == null) return;
      el.innerHTML = esc(raw)
        .replace(/\{name\}/g, `<span class="script">${esc(C.person.name)}</span>`)
        .replace(/\{from\}/g, esc(C.person.from))
        .replace(/\{date\}/g, esc(C.event.dateLabel));
    });
    $$('[data-tp]', root).forEach(el => { el.placeholder = t(el.dataset.tp); });
  }

  // Theme colours from config -> CSS variables
  function applyTheme() {
    const th = C.theme, root = document.documentElement.style;
    const vars = { '--bg': th.bg, '--bg-glow': th.bgGlow, '--pink': th.primary, '--pink2': th.primarySoft, '--gold': th.accent, '--purple': th.secondary, '--text': th.text, '--muted': th.muted };
    Object.keys(vars).forEach(k => { if (vars[k]) root.setProperty(k, vars[k]); });
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = th.bg;
  }

  gsap.registerPlugin(ScrollTrigger);

  let cake = null;

  /* ---------------- Storage (remembers visits on her phone) ---------------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  // Keys include name + date, so reusing the site for someone else / next year starts fresh
  const KEY_BASE = `surprise_${C.person.name}_${C.event.date}`.replace(/[^\w-]/g, '');
  const KEY_OPENED = KEY_BASE + '_opened';
  const KEY_SURPRISE = KEY_BASE + '_enabled';
  const KEY_LOGIN = KEY_BASE + '_login';
  const KEY_GAMES = KEY_BASE + '_games';
  const KEY_REWARDS = KEY_BASE + '_rewards';
  const KEY_LOCK = KEY_BASE + '_lock';
  const KEY_LUCKY = KEY_BASE + '_lucky';
  const loadRewards = () => { try { return JSON.parse(store.get(KEY_REWARDS)) || {}; } catch (e) { return {}; } };
  function saveReward(gameIndex, r) {
    const all = loadRewards();
    all[gameIndex] = { value: String(r.value) };
    store.set(KEY_REWARDS, JSON.stringify(all));
  }

  /* ---------------- Encrypted content ----------------
     Photos, videos, letter and game data live in secure/ as AES-GCM files.
     The key comes from the 5 login answers and is never stored; see encrypt.js. */
  const SECURE = 'secure/';
  let MEDIA = {}, contentKey = null;
  const mediaCache = {};
  const fetchBin = url => fetch(url, { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new TypeError('missing ' + url);
    return r.arrayBuffer();
  });
  // Must match keyMaterial() in encrypt.js exactly
  const keyText = v => String(v).trim().toLowerCase().replace(/\s+/g, '');
  const keyDate = v => {
    const parts = String(v).trim().split(/\D+/).filter(Boolean);
    return parts.length === 3 ? parts[0].padStart(2, '0') + parts[1].padStart(2, '0') + parts[2] : parts.join('');
  };
  const keyMaterial = (names, dobs, secret) => ['bday-v1', ...names.map(keyText), ...dobs.map(keyDate), keyText(secret)].join('|');

  async function deriveKey(material) {
    const meta = await fetch(SECURE + 'meta.json', { cache: 'no-cache' }).then(r => r.json());
    const salt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: meta.iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  const decryptBuf = (key, buf) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));

  let dataBin = null;
  // Throws OperationError when the answers are wrong (the data simply can't be decrypted)
  async function unlockContent(material) {
    const key = await deriveKey(material);
    const buf = await (dataBin || (dataBin = fetchBin(SECURE + 'data.bin').catch(e => { dataBin = null; throw e; })));
    const plain = await decryptBuf(key, buf);
    const json = JSON.parse(new TextDecoder().decode(plain));
    contentKey = key;
    MEDIA = json.media || {};
    Object.assign(C, json.data);
  }

  // Decrypted media become blob: URLs (only in this browser tab's memory)
  function getMedia(path) {
    const m = MEDIA[path];
    if (!m) return Promise.resolve(path);
    if (!mediaCache[path]) {
      mediaCache[path] = fetchBin(SECURE + 'm/' + m.id + '.bin')
        .then(b => decryptBuf(contentKey, b))
        .then(plain => URL.createObjectURL(new Blob([plain], { type: m.type })));
      mediaCache[path].catch(() => { delete mediaCache[path]; });
    }
    return mediaCache[path];
  }

  // Open every photo up front and swap their paths for blob URLs; videos load quietly in the background
  async function prepareMedia(onProgress) {
    const images = Object.keys(MEDIA).filter(k => MEDIA[k].type.startsWith('image/'));
    const urls = {};
    let done = 0;
    await Promise.all(images.map(k => getMedia(k).then(u => { urls[k] = u; onProgress(++done, images.length); })));
    (function swap(o) {
      Object.keys(o).forEach(k => {
        const v = o[k];
        if (typeof v === 'string' && urls[v]) o[k] = urls[v];
        else if (v && typeof v === 'object') swap(v);
      });
    })({ games: C.games, photos: C.photos, carouselPhotos: C.carouselPhotos, timeline: C.timeline, reasons: C.reasons, gifts: C.gifts });
    Object.keys(MEDIA).filter(k => MEDIA[k].type.startsWith('video/')).forEach(k => getMedia(k).catch(() => {}));
  }

  /* ---------------- Trusted time (from the server, not the phone clock) ---------------- */
  let timeOffset = 0;
  const now = () => Date.now() + timeOffset;
  async function syncTime() {
    if (location.protocol === 'file:') return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const t0 = Date.now();
      const res = await fetch(`${location.pathname}?_t=${t0}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      const server = new Date(res.headers.get('date')).getTime();
      if (!isNaN(server)) timeOffset = server - (t0 + Date.now()) / 2;
    } catch (e) { /* offline: fall back to the device clock */ }
  }

  /* ---------------- Content ---------------- */
  // Basics are safe to show on the countdown screen.
  function fillBasics() {
    applyTheme();
    applyTexts();
    document.title = t('pageTitle');
    const hide = { together: '#together', moments: '#moments', story: '#story', wall: '#wall-sec', reasons: '#reasons', gifts: '#gifts', letter: '#letter', finale: '#finale', mic: '#micBtn' };
    Object.keys(hide).forEach(k => { if (SHOW[k] === false && $(hide[k])) $(hide[k]).remove(); });
    if (SHOW.marquee === false) $$('.marquee').forEach(m => m.remove());
  }

  // Everything personal is only put into the page after it unlocks.
  function fillContent() {
    $('#heroName').textContent = C.person.name;

    const words = (C.marquee || []).map(w => `<span>${esc(fmt(w))}</span><i>✦</i>`).join('');
    $$('.marquee-track').forEach(m => { m.innerHTML = words + words; });

    const tl = $('#timeline');
    if (tl) C.timeline.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = `tl-item ${i % 2 ? 'right' : 'left'}`;
      const media = item.emoji ? `<div class="tl-emoji">${esc(item.emoji)}</div>`
        : item.photo ? `<img src="${esc(item.photo)}" alt="">` : '';
      const body = item.points
        ? `<ol class="tl-points">${item.points.map(pt => `<li>${esc(fmt(pt))}</li>`).join('')}</ol>`
        : `<p>${esc(fmt(item.text))}</p>`;
      div.innerHTML = `<div class="tl-dot"></div><div class="tl-card">${media}<div class="tl-body"><span class="tl-date">${esc(item.date)}</span><h3>${esc(item.title)}</h3>${body}</div></div>`;
      tl.appendChild(div);
    });

    const wall = $('#wall');
    if (wall) C.photos.forEach((p, i) => {
      const fig = document.createElement('figure');
      fig.className = 'polaroid';
      fig.dataset.index = i;
      fig.innerHTML = `<img src="${esc(p.src)}" alt="">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}`;
      wall.appendChild(fig);
    });

    const grid = $('#reasonsGrid');
    if (grid) C.reasons.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'flip';
      d.innerHTML = `<div class="flip-inner">
        <div class="flip-face flip-front"><span class="num">${pad(i + 1)}</span><div class="emoji">${esc(r.emoji)}</div><h3>${esc(r.title)}</h3><span class="tap">${esc(t('reasonsTap'))}</span></div>
        <div class="flip-face flip-back"><p>${esc(r.text)}</p></div></div>`;
      d.addEventListener('click', () => {
        d.classList.toggle('flipped');
        if (d.classList.contains('flipped')) {
          const b = d.getBoundingClientRect();
          heartBurst((b.left + b.width / 2) / innerWidth, (b.top + b.height / 2) / innerHeight, 14);
        }
      });
      grid.appendChild(d);
    });

    const gifts = $('#giftsGrid');
    if (gifts) (C.gifts || []).forEach(g => {
      const d = document.createElement('div');
      d.className = 'scratch-card';
      d.innerHTML = `<div class="scratch-content"><div class="emoji">${esc(g.emoji)}</div><h3>${esc(g.title)}</h3><p>${esc(g.text)}</p></div><canvas></canvas>`;
      gifts.appendChild(d);
    });
    if (gifts && !(C.gifts || []).length) $('#gifts').remove();

    if ($('#together')) {
      if (C.event.togetherSince) {
        const d = new Date(C.event.togetherSince);
        $('#togetherDate').textContent = d.toLocaleDateString(C.event.locale, { day: 'numeric', month: 'long', year: 'numeric' });
      } else {
        $('#together').remove();
      }
    }
  }

  /* ---------------- Confetti ---------------- */
  function burst() {
    confetti({ particleCount: 160, spread: 110, startVelocity: 45, origin: { y: 0.6 }, colors: COLORS });
  }
  function sideCannons(ms) {
    const end = Date.now() + (ms || 2500);
    (function f() {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS });
      if (Date.now() < end) requestAnimationFrame(f);
    })();
  }
  let heartShape = null;
  try { heartShape = confetti.shapeFromText({ text: '❤️', scalar: 2 }); } catch (e) { /* older browsers */ }
  function heartBurst(x, y, n) {
    confetti({
      particleCount: n || 30, spread: 90, startVelocity: 25, scalar: heartShape ? 2 : 1, gravity: 0.6, ticks: 120,
      origin: { x, y }, colors: COLORS, shapes: heartShape ? [heartShape] : undefined
    });
  }

  /* ---------------- Music ---------------- */
  // Two tracks: a playful game tune (after login, during games + lock) and the birthday song (after midnight).
  // `audio` always points at the track that is currently in use; the top-right button mutes/unmutes it.
  const musicBtn = $('#musicBtn');
  let musicReady = false;
  function makeTrack(src, volume) {
    const a = new Audio();
    if (!src) return a;
    a.src = src;
    a.loop = true;
    a.volume = volume;
    a.preload = 'auto';
    a.addEventListener('canplay', () => { musicReady = true; }, { once: true });
    a.addEventListener('error', () => { if (a === audio) musicBtn.classList.add('hidden'); });
    return a;
  }
  const bdayAudio = makeTrack(C.music, S.musicVolume);
  const gameAudio = makeTrack(C.gameMusic, S.gameMusicVolume != null ? S.gameMusicVolume : 0.4);
  let audio = bdayAudio;
  let gameMuted = false;       // she switched the game tune off; keep it off from game to game

  function startMusic() {
    if (!audio.src) return;
    audio.play().then(() => {
      musicBtn.classList.remove('hidden');
      musicBtn.classList.add('playing');
    }).catch(() => { if (musicReady) musicBtn.classList.remove('hidden'); });
  }
  // Login done: games start with the game tune
  function startGameMusic() {
    if (!C.gameMusic) return;
    audio = gameAudio;
    if (gameMuted) { musicBtn.classList.remove('hidden', 'playing'); return; }
    startMusic();
  }
  // Games/lock finished: stop the game tune; from here on the birthday song is the track in use
  function stopGameMusic() {
    gameAudio.pause();
    if (audio === gameAudio) { audio = bdayAudio; musicBtn.classList.add('hidden'); musicBtn.classList.remove('playing'); }
  }
  musicBtn.addEventListener('click', () => {
    if (audio.paused) { audio.play(); musicBtn.classList.add('playing'); }
    else { audio.pause(); musicBtn.classList.remove('playing'); }
    if (audio === gameAudio) gameMuted = audio.paused;
  });

  /* ---------------- Gate / countdown ---------------- */
  let gateTimer = 0;
  function showGate(target) {
    const gate = $('#gate');
    gate.classList.remove('hidden');
    gsap.set(gate, { opacity: 1 });
    if (store.get(KEY_SURPRISE)) showSurpriseEnabled();
    // Replay games while waiting
    const replay = $('#gateReplayGames');
    replay.classList.toggle('hidden', !(C.games || []).length);
    confirmTap(replay, () => {
      clearInterval(gateTimer);
      resetGames();
      gsap.to(gate, { opacity: 0, duration: 0.5, onComplete: () => { gate.classList.add('hidden'); playGame(0); } });
    });
    gsap.from('#gate > *', { y: 40, opacity: 0, stagger: 0.15, duration: 1, ease: 'power3.out' });
    const tick = () => {
      const diff = target - now();
      if (diff <= 0) {
        clearInterval(gateTimer);
        gsap.to(gate, { opacity: 0, duration: 0.8, onComplete: () => { gate.classList.add('hidden'); afterUnlock(); } });
        burst();
        return;
      }
      $('#cdD').textContent = pad(Math.floor(diff / 864e5));
      $('#cdH').textContent = pad(Math.floor(diff / 36e5) % 24);
      $('#cdM').textContent = pad(Math.floor(diff / 6e4) % 60);
      $('#cdS').textContent = pad(Math.floor(diff / 1e3) % 60);
    };
    clearInterval(gateTimer);
    gateTimer = setInterval(tick, 1000);
    tick();
  }

  /* ---------------- After unlock: song first, then login ---------------- */
  // Browsers only allow sound after a tap, so we try autoplay and fall back to a "Tap to begin" screen.
  function tryAutoplay() {
    if (!C.music) return Promise.resolve('none');
    return audio.play().then(() => {
      musicBtn.classList.remove('hidden');
      musicBtn.classList.add('playing');
      return 'playing';
    }).catch(err => (err && err.name === 'NotAllowedError' ? 'blocked' : 'none'));
  }

  /* ---------------- Flow ----------------
     Login → games (coming soon) → countdown (until the date) → Tap to begin + song → gift → cake...  */
  function startFlow() {
    // Everything private is encrypted, so the login always comes first (its answers are the key)
    showLogin();
  }
  // Testing shortcut: ?preview=KEY&jump=cake skips the games and the lock after login
  const jumpToCake = (() => {
    const params = new URLSearchParams(location.search);
    return !!C.event.previewKey && params.get('preview') === C.event.previewKey && params.get('jump') === 'cake';
  })();

  // How many games she has already won on this device (so she never replays them)
  const gamesWon = () => Math.max(0, parseInt(store.get(KEY_GAMES), 10) || 0);

  // After login the visit lasts N minutes, then the page reloads back to the login screen.
  let sessionStarted = false;
  function startSessionTimer() {
    const mins = Number(C.login && C.login.sessionMinutes) || 0;
    if (sessionStarted || mins <= 0) return;
    sessionStarted = true;
    const end = Date.now() + mins * 60000;   // wall-clock based, so background tabs stay accurate
    const el = $('#sessionTimer'), out = $('#sessionTime');
    if (C.login.showSessionTimer !== false) el.classList.remove('hidden');
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) { clearInterval(timer); el.classList.add('hidden'); showSessionEnd(); return; }
      const s = Math.ceil(left / 1000);
      out.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      el.classList.toggle('ending', s <= 60);
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  }

  // "Ab padhai karo" popup with a countdown, then reload back to the login page
  function showSessionEnd() {
    const box = $('#sessionEnd'), count = $('#sessionCount');
    if (document.activeElement) document.activeElement.blur();
    box.classList.remove('hidden');
    gsap.fromTo('#sessionEnd .modal-card', { y: 40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' });
    const end = Date.now() + (Number(C.login.sessionEndPopupSeconds) || 10) * 1000;
    const tick = () => {
      const s = Math.ceil((end - Date.now()) / 1000);
      if (s <= 0) { clearInterval(iv); location.reload(); return; }
      count.textContent = t('sessionEndCount').replace('{n}', s);
    };
    const iv = setInterval(tick, 250);
    tick();
  }

  function afterLogin() {
    startSessionTimer();
    if (jumpToCake) return goToCountdown();
    if ((C.games || []).length) showGamesIntro();
    else goToCountdown();
  }

  /* ---------------- Games ---------------- */
  const resetGames = () => { store.set(KEY_GAMES, '0'); store.set(KEY_LOCK, '0'); };

  // Reset buttons need two taps so nothing is lost by accident
  function confirmTap(btn, action) {
    let armed = false, timer = 0, original = '';
    btn.onclick = () => {
      if (!armed) {
        armed = true;
        original = btn.textContent;
        btn.textContent = t('resetConfirm');
        btn.classList.add('armed');
        timer = setTimeout(() => { armed = false; btn.textContent = original; btn.classList.remove('armed'); }, 3000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      btn.textContent = original;
      btn.classList.remove('armed');
      action();
    };
  }

  // Collected treasure numbers as small gold boxes
  function renderRewardChips(box, heading) {
    const won = (C.games || []).slice(0, gamesWon()).map((g, i) => ({ no: i + 1, value: g.reward && g.reward.value })).filter(x => x.value);
    box.innerHTML = `<p>${esc(heading)}</p><div class="gi-chips">${won.map(x =>
      `<span class="gi-chip"><small>#${x.no}</small><b>${esc(x.value)}</b></span>`).join('')}</div>`;
    box.classList.toggle('hidden', !won.length);
  }

  // After the last game: "open the lock with your treasure numbers" page
  function afterGames() {
    if (lockDone() >= lockStages().length) return afterLock();
    const el = $('#lockIntro');
    renderRewardChips($('#lockRewards'), t('lockIntroSaved'));
    el.classList.remove('hidden');
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    gsap.from('#lockIntro > *', { y: 40, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'back.out(1.6)' });
    let leaving = false;
    $('#lockReady').onclick = () => {
      if (leaving) return;
      leaving = true;
      gsap.to(el, { opacity: 0, duration: 0.5, onComplete: () => { el.classList.add('hidden'); lockStep(); } });
    };
  }

  /* ---------------- The 4-key lock (after all games) ---------------- */
  const lockStages = () => (C.lock && C.lock.stages) || [];
  const lockDone = () => Math.max(0, parseInt(store.get(KEY_LOCK), 10) || 0);
  // Every game's treasure number, in game order
  const treasureList = () => (C.games || []).map((g, i) => ({ i, title: fmt(g.title), value: g.reward ? String(g.reward.value) : '' })).filter(x => x.value);

  function renderLockHud(done) {
    const total = lockStages().length;
    $('#lockSlots').innerHTML = Array.from({ length: total }, (_, k) => `<i class="${k < done ? 'on' : ''}">${k < done ? '🔑' : ''}</i>`).join('');
    const open = Math.round(done * 100 / total);
    $('#lockPct').textContent = done >= total ? t('lockAllOpen')
      : done ? t('lockProgress').replace('{open}', open).replace('{closed}', 100 - open) : t('lockLocked');
    $('#lockBig').textContent = done >= total ? '🔓' : '🔒';
  }

  function lockStep() {
    const total = lockStages().length;
    if (!total || lockDone() >= total) return afterLock();
    $('#lockHud').classList.remove('hidden');
    renderLockHud(lockDone());
    gsap.fromTo('#lockHud', { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' });
    const el = $('#lockGame');
    el.classList.remove('hidden');
    gsap.set(el, { opacity: 1 });
    runLockStage(lockDone());
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function runLockStage(si) {
    const stages = lockStages(), st = stages[si];
    const nums = treasureList();
    const body = $('#lockBody'), err = $('#lockError'), btn = $('#lockBtn');
    const bar = $('#lockTimer'), fill = $('#lockTimerFill'), label = $('#lockTimerText');
    // Failed attempts are remembered on the phone (they survive the 10-minute session reloads).
    // After `extendAfterTries` time-ups the stage gives `extendedSeconds` instead of `seconds`.
    const triesKey = KEY_LOCK + '_tries_' + si;
    const failedTries = () => Math.max(0, parseInt(store.get(triesKey), 10) || 0);
    // timeSteps: [{ after: 0, seconds: 60 }, { after: 5, seconds: 90 }, ...] = timer after N failed tries
    const stageSeconds = () => {
      const f = failedTries();
      if (Array.isArray(st.timeSteps) && st.timeSteps.length) {
        const step = st.timeSteps.filter(x => f >= (Number(x.after) || 0)).pop() || st.timeSteps[0];
        return Number(step.seconds) || 0;
      }
      return st.extendAfterTries && f >= st.extendAfterTries
        ? Number(st.extendedSeconds) || Number(st.seconds) || 0
        : Number(st.seconds) || 0;
    };
    const fmtTime = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
    const isLastChance = () => st.skipAfterTries && failedTries() === st.skipAfterTries - 1;
    let secs = stageSeconds();
    let state = 'ready', endAt = 0, raf = 0;

    $('#lockBadge').textContent = '🔐';
    $('#lockStageText').textContent = t('lockStage').replace('{n}', si + 1).replace('{total}', stages.length);
    $('#lockTitle').textContent = fmt(st.title);
    err.textContent = '';
    err.classList.remove('quiz-ok');
    bar.classList.toggle('hidden', !secs);

    // What she has to type, and the right answer(s)
    let rows = null, single = null;
    if (st.type === 'recall' || st.type === 'double') {
      rows = shuffled(nums).map(n => ({
        label: st.type === 'double' ? t('lockRowDouble').replace('{game}', n.title) : n.title,
        no: n.i + 1,
        answer: String(st.type === 'double' ? Number(n.value) * 2 : Number(n.value))
      }));
    } else if (st.type === 'sum') {
      single = String(nums.reduce((s, n) => s + Number(n.value), 0));
    } else if (st.type === 'product') {
      const count = Math.min(nums.length, Number(st.count) || nums.length);
      const used = nums.slice(0, count).map(n => (st.digit === 'ones' ? String(n.value).slice(-1) : String(n.value)));
      single = used.reduce((p, v) => p * BigInt(v), 1n).toString();
      st._list = used.join(' × ');
      st._count = count;
    }
    $('#lockQuestion').textContent = fmt(st.question).replace('{count}', st._count || '').replace('{list}', st._list || '');

    if (rows) {
      body.innerHTML = `<div class="lock-rows">${rows.map((r, k) =>
        `<div class="lock-row"><label for="lk${k}"><small>#${r.no}</small>${esc(r.label)}</label><input id="lk${k}" type="text" inputmode="numeric" maxlength="${r.answer.length + 1}" autocomplete="off"></div>`).join('')}</div>`;
    } else {
      body.innerHTML = `<label class="field-box"><input id="lkSingle" type="text" inputmode="numeric" placeholder=" " autocomplete="off"><span class="ph">${esc(t('gameEmpty') === '' ? '' : 'Jawab likho...')}</span></label>`;
    }
    const inputs = $$('input', body);
    const digits = v => String(v).replace(/[^\d]/g, '');

    const showTime = ms => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      label.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      fill.style.transform = `scaleX(${Math.max(0, ms / (secs * 1000))})`;
      bar.classList.toggle('low', state === 'running' && s <= 10);
    };

    function reset() {
      secs = stageSeconds();
      state = secs ? 'ready' : 'running';
      cancelAnimationFrame(raf);
      inputs.forEach(i => { i.value = ''; i.disabled = !!secs; (i.closest('.lock-row') || i.closest('.field-box')).classList.remove('bad', 'good'); });
      err.textContent = '';
      btn.textContent = t('lockCheck');
      if (secs) { showTime(secs * 1000); start(); }      // no "Start" button: the clock runs straight away
      else if (!isTouch) setTimeout(() => inputs[0].focus({ preventScroll: true }), 400);
    }

    function start() {
      state = 'running';
      endAt = Date.now() + secs * 1000;
      inputs.forEach(i => { i.disabled = false; });
      btn.textContent = t('lockCheck');
      inputs[0].focus({ preventScroll: true });
      (function loop() {
        if (state !== 'running') return;
        const left = endAt - Date.now();
        showTime(left);
        if (left <= 0) return timeUp();
        raf = requestAnimationFrame(loop);
      })();
    }

    function timeUp() {
      state = 'over';
      inputs.forEach(i => { i.disabled = true; });
      if (document.activeElement) document.activeElement.blur();
      const before = stageSeconds();
      store.set(triesKey, String(failedTries() + 1));
      const after = stageSeconds();
      // Out of chances: tease her, then open this lock for her anyway
      if (st.skipAfterTries && failedTries() >= st.skipAfterTries) {
        state = 'skip';
        err.textContent = fmt(st.skipMessage || t('lockTimeUp'));
        btn.textContent = t('lockSkipBtn');
        bar.classList.remove('low');
        return;
      }
      err.textContent = isLastChance()
        ? t('lockLastChance').replace('{time}', fmtTime(after))
        : after > before ? t('lockMoreTime').replace('{time}', fmtTime(after)) : t('lockTimeUp');
      btn.textContent = t('lockRetry');
      bar.classList.remove('low');
      gsap.fromTo('#lockCard', { x: 0 }, { keyframes: [{ x: -14 }, { x: 12 }, { x: -8 }, { x: 6 }, { x: 0 }], duration: 0.45 });
    }

    const allRight = () => rows
      ? inputs.every((inp, k) => digits(inp.value) === rows[k].answer)
      : digits(inputs[0].value).replace(/^0+(?=\d)/, '') === single;

    function win(skipped) {
      state = 'won';
      cancelAnimationFrame(raf);
      bar.classList.remove('low');
      inputs.forEach(i => { i.disabled = true; if (!skipped) (i.closest('.lock-row') || i.closest('.field-box')).classList.add('good'); });
      if (document.activeElement) document.activeElement.blur();
      store.set(KEY_LOCK, String(Math.max(lockDone(), si + 1)));
      err.textContent = skipped ? t('lockSkipKey') : t('lockKey');
      err.classList.add('quiz-ok');
      btn.classList.add('hidden');
      $('#lockBadge').textContent = '🔑';
      heartBurst(0.5, 0.45, 20);
      flyKeyToLock(si + 1, () => {
        if (si + 1 >= stages.length) return unlockFinale();
        btn.textContent = t('lockNext');
        btn.classList.remove('hidden');
        gsap.fromTo(btn, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
        state = 'next';
      });
    }

    inputs.forEach((inp, k) => inp.addEventListener('input', () => {
      inp.value = digits(inp.value);
      (inp.closest('.lock-row') || inp.closest('.field-box')).classList.remove('bad');
      err.textContent = '';
      if (rows && inp.value.length >= rows[k].answer.length && inputs[k + 1]) inputs[k + 1].focus({ preventScroll: true });
      if (rows && state === 'running' && allRight()) win();
    }));

    $('#lockForm').onsubmit = e => {
      e.preventDefault();
      if (state === 'ready') return start();
      if (state === 'over') return reset();
      if (state === 'skip') return win(true);
      if (state === 'next') {
        btn.classList.remove('hidden');
        return gsap.to('#lockCard', { scale: 0.85, opacity: 0, duration: 0.4, onComplete: () => {
          gsap.set('#lockCard', { scale: 1, opacity: 1 });
          runLockStage(si + 1);
          gsap.from('#lockCard', { scale: 0.6, opacity: 0, rotation: -6, duration: 0.8, ease: 'back.out(1.7)' });
        } });
      }
      if (state !== 'running') return;
      if (inputs.some(i => !i.value.trim())) { err.textContent = t('lockEmpty'); return; }
      if (allRight()) return win();
      const wrong = rows ? inputs.filter((inp, k) => digits(inp.value) !== rows[k].answer) : inputs;
      wrong.forEach(inp => (inp.closest('.lock-row') || inp.closest('.field-box')).classList.add('bad'));
      err.textContent = rows ? t('lockWrong').replace('{count}', wrong.length) : t('lockWrongOne');
      gsap.fromTo('#lockCard', { x: 0 }, { keyframes: [{ x: -14 }, { x: 12 }, { x: -8 }, { x: 6 }, { x: 0 }], duration: 0.45 });
      if (navigator.vibrate) navigator.vibrate(100);
    };

    reset();
  }

  // A key flies from the card into the lock in the corner
  function flyKeyToLock(done, then) {
    const from = $('#lockBadge').getBoundingClientRect(), to = $('#lockBig').getBoundingClientRect();
    const key = document.createElement('span');
    key.className = 'fly-key';
    key.textContent = '🔑';
    document.body.appendChild(key);
    gsap.set(key, { left: from.left + from.width / 2 - 27, top: from.top + from.height / 2 - 30, scale: 0.4 });
    gsap.timeline({ onComplete: () => { key.remove(); then(); } })
      .to(key, { scale: 1.3, rotation: -20, duration: 0.4, ease: 'back.out(2)' })
      .to(key, { left: to.left + to.width / 2 - 27, top: to.top + to.height / 2 - 30, rotation: 340, scale: 0.55, duration: 0.9, ease: 'power2.inOut' })
      .add(() => {
        renderLockHud(done);
        gsap.fromTo('#lockBig', { scale: 1.4 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
        gsap.fromTo('#lockHud', { x: 0 }, { keyframes: [{ x: -6 }, { x: 6 }, { x: -3 }, { x: 0 }], duration: 0.4 });
      })
      .to({}, { duration: 0.5 });
  }

  // Last key: the lock flies to the centre, shakes, springs open, then the win message
  function unlockFinale() {
    const stage = document.createElement('div');
    stage.className = 'unlock-stage';
    stage.innerHTML = '<div class="unlock-lock"><span class="unlock-icon">🔒</span><i class="unlock-ring"></i></div>';
    document.body.appendChild(stage);
    const icon = $('.unlock-icon', stage);
    gsap.timeline({ onComplete: () => stage.remove() })
      .fromTo(stage, { opacity: 0 }, { opacity: 1, duration: 0.4 })
      .fromTo('.unlock-lock', { scale: 0.2, y: -200, x: 120 }, { scale: 1, y: 0, x: 0, duration: 0.8, ease: 'back.out(1.5)' }, '<')
      .to('.unlock-lock', { keyframes: [{ rotation: -12 }, { rotation: 12 }, { rotation: -9 }, { rotation: 9 }, { rotation: 0 }], duration: 0.7 })
      .add(() => { icon.textContent = '🔓'; renderLockHud(lockStages().length); burst(); sideCannons(2500); heartBurst(0.5, 0.5, 50); })
      .fromTo('.unlock-lock', { scale: 1.5 }, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.4)' })
      .fromTo('.unlock-ring', { scale: 0, opacity: 1 }, { scale: 12, opacity: 0, duration: 1.2, ease: 'power2.out' }, '<')
      .to({}, { duration: 0.8 })
      .to(stage, { opacity: 0, duration: 0.5 })
      .add(showLockWin);
  }

  function showLockWin() {
    $('#lockBadge').textContent = '🔓';
    $('#lockStageText').textContent = '';
    $('#lockTitle').textContent = t('lockOpenTitle');
    $('#lockQuestion').textContent = t('lockOpenText');
    $('#lockTimer').classList.add('hidden');
    $('#lockBody').innerHTML = '';
    $('#lockError').textContent = '';
    const btn = $('#lockBtn');
    btn.textContent = t('lockFinalBtn');
    btn.classList.remove('hidden');
    gsap.from('#lockCard', { scale: 0.7, opacity: 0, duration: 0.8, ease: 'back.out(1.7)' });
    let leaving = false;
    $('#lockForm').onsubmit = e => {
      e.preventDefault();
      if (leaving) return;
      leaving = true;
      gsap.to(['#lockGame', '#lockHud'], { opacity: 0, duration: 0.6, onComplete: () => {
        $('#lockGame').classList.add('hidden');
        $('#lockHud').classList.add('hidden');
        afterLock();
      } });
    };
  }


  function showGamesIntro() {
    const el = $('#gamesIntro');
    const total = C.games.length;
    const done = Math.min(gamesWon(), total);
    $('#giSteps').innerHTML = t('gamesIntroSteps').split('|')
      .map(s => `<span class="gi-step">${esc(s.trim())}</span>`).join('<span class="gi-arrow">➜</span>');
    $('#giProgress').textContent = t('gamesProgress').replace('{done}', done).replace('{total}', total);
    $('#giProgress').classList.toggle('hidden', !done);
    $('#restartGames').classList.toggle('hidden', !done);
    renderRewardChips($('#giRewards'), t('rewardsSaved'));
    $('#enterGames').textContent = !done ? t('gamesIntroBtn')
      : done >= total ? t('gamesAllDoneBtn')
      : t('gamesContinueBtn').replace('{n}', done + 1);
    el.classList.remove('hidden');
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    gsap.from('#gamesIntro > *', { y: 40, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'back.out(1.6)' });

    let leaving = false;
    const leave = then => {
      if (leaving) return;
      leaving = true;
      gsap.to(el, { opacity: 0, duration: 0.5, onComplete: () => { el.classList.add('hidden'); then(); } });
    };
    // Continue the current journey
    $('#enterGames').onclick = () => leave(() => (done >= total ? afterGames() : playGame(done)));
    // Or wipe progress and play everything again
    confirmTap($('#restartGames'), () => { resetGames(); leave(() => playGame(0)); });
  }

  // Games run one after another; each calls next() when won.
  const GAME_TYPES = { guess: guessGame, table: tableGame, quiz: quizGame, puzzle: puzzleGame, catch: catchGame, kiss: kissGame, cards: cardsGame, dice: diceGame };
  let stopCurrentGame = () => {};
  function playGame(i) {
    stopCurrentGame();
    stopCurrentGame = () => {};
    const games = C.games || [];
    if (i >= games.length) return finishGames();
    const g = games[i];
    const next = () => playGame(i + 1);
    const run = GAME_TYPES[g.type];
    if (run) run(g, i, games.length, next);
    else next();
  }

  function finishGames() {
    burst();
    sideCannons(1800);
    const el = $('#game');
    $('#gameBtn').textContent = t('gamesDone');
    gsap.to(el, { opacity: 0, duration: 0.7, delay: 1.2, onComplete: () => { el.classList.add('hidden'); afterGames(); } });
  }

  // Shared card setup. `parts` lists which blocks this game uses: guess, table, timer.
  function setupGameCard(g, index, total, parts) {
    const el = $('#game');
    $('#gameBadge').textContent = g.badge || '🎯';
    $('#gameStep').textContent = t('gameStep').replace('{n}', index + 1).replace('{total}', total);
    $('#gameTitle').textContent = fmt(g.title);
    $('#gameQuestion').textContent = fmt(g.question);
    $('#gameHint').classList.add('hidden');
    $('#gameError').textContent = '';
    $('#guessField').classList.toggle('hidden', !parts.includes('guess'));
    $('#tableGrid').classList.toggle('hidden', !parts.includes('table'));
    $('#gameTimer').classList.toggle('hidden', !parts.includes('timer'));
    $('#quizArea').classList.toggle('hidden', !parts.includes('quiz'));
    $('#puzzleArea').classList.toggle('hidden', !parts.includes('puzzle'));
    $('#catchArea').classList.toggle('hidden', !parts.includes('catch'));
    $('#kissArea').classList.toggle('hidden', !parts.includes('kiss'));
    $('#cardsArea').classList.toggle('hidden', !parts.includes('cards'));
    $('#diceArea').classList.toggle('hidden', !parts.includes('dice'));
    $('#treasureArea').classList.add('hidden');
    $('#gameBtn').classList.remove('hidden');
    $('#gameEquation').textContent = g.equation || '';
    $('#gameEquation').classList.toggle('hidden', !g.equation);
    if (g.picture) $('#gamePicture').src = g.picture;
    $('#gamePictureBox').classList.toggle('hidden', !g.picture);
    el.classList.remove('hidden');
    gsap.set(el, { opacity: 1 });
    gsap.fromTo('#gameCard', { scale: 0.6, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.9, ease: 'back.out(1.7)' });
  }

  function shakeGameCard() {
    gsap.fromTo('#gameCard', { x: 0 }, { keyframes: [{ x: -14 }, { x: 12 }, { x: -8 }, { x: 6 }, { x: 0 }], duration: 0.45 });
    if (navigator.vibrate) navigator.vibrate(120);
  }

  function gameWon(g, index, total, next) {
    $('#gameBtn').classList.remove('hidden');
    store.set(KEY_GAMES, String(Math.max(gamesWon(), index + 1)));
    if (document.activeElement) document.activeElement.blur();
    $('#gameError').textContent = '';
    $('#gameBadge').textContent = '🏆';
    gsap.fromTo('#gameBadge', { scale: 0.4, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    $('#gameBtn').textContent = fmt(g.winMessage) || '🎉';
    heartBurst(0.5, 0.45, 40);
    const leave = () => {
      if (index + 1 >= total) return next();
      gsap.to('#gameCard', { scale: 0.8, opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: next });
    };
    setTimeout(() => (g.reward ? showTreasure(g, index, leave) : leave()), 1500);
  }

  // After every win: the chest shakes, opens, and gives this game's number. She continues with a tap.
  function showTreasure(g, index, done) {
    const r = g.reward;
    saveReward(index, r);
    ['#guessField', '#tableGrid', '#gameTimer', '#quizArea', '#puzzleArea', '#catchArea', '#kissArea',
      '#cardsArea', '#diceArea', '#gameEquation', '#gamePictureBox', '#gameHint'].forEach(s => $(s).classList.add('hidden'));
    $('#gameError').textContent = '';
    $('#gameQuestion').textContent = fmt(r.title || t('treasureTitle'));
    const label = fmt(r.label || t('treasureLabel')).replace('{n}', index + 1);
    const text = r.text != null ? fmt(r.text) : t('treasureText');
    const area = $('#treasureArea');
    area.innerHTML = `<div class="treasure">
        <div class="chest"><div class="chest-glow"></div><div class="chest-body"></div><div class="chest-lid"></div></div>
        <div class="treasure-card" style="opacity:0"><small>${esc(label)}</small><b>${esc(r.value)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>
      </div>`;
    area.classList.remove('hidden');
    const btn = $('#gameBtn');
    btn.classList.add('hidden');
    btn.disabled = false;
    gsap.timeline()
      .fromTo('.chest', { y: 20, scale: 0.8, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.8)' })
      .to('.chest', { keyframes: [{ rotation: -6 }, { rotation: 6 }, { rotation: -4 }, { rotation: 0 }], duration: 0.6 })
      .to('.chest-lid', { rotationX: -115, duration: 0.7, ease: 'back.out(1.6)' })
      .to('.chest-glow', { scale: 14, opacity: 0, duration: 1.1, ease: 'power2.out' }, '<')
      .add(() => { burst(); heartBurst(0.5, 0.45, 30); })
      .fromTo('.treasure-card', { y: 30, scale: 0.6, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: 'elastic.out(1, 0.55)' }, '-=0.6')
      .add(() => {
        btn.textContent = t('rewardNext');
        btn.classList.remove('hidden');
        gsap.fromTo(btn, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
      });
    let leaving = false;
    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (leaving) return;
      leaving = true;
      done();
    };
  }

  const normAnswer = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

  // Game pictures open full screen on tap (handy for counting on a phone)
  $('#gamePicture').addEventListener('click', () => {
    $('#pictureZoomImg').src = $('#gamePicture').src;
    $('#pictureZoom').classList.remove('hidden');
    gsap.fromTo('#pictureZoomImg', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' });
  });
  $('#pictureZoom').addEventListener('click', () => $('#pictureZoom').classList.add('hidden'));

  /* Game type "guess": type the right answer */
  function guessGame(g, index, total, next) {
    const input = $('#gameAnswer'), box = input.closest('.field-box');
    let tries = 0, won = false;

    setupGameCard(g, index, total, ['guess']);
    $('#gamePh').textContent = fmt(g.placeholder);
    $('#gameBtn').textContent = t('gameBtn');
    if (g.inputMode) input.setAttribute('inputmode', g.inputMode); else input.removeAttribute('inputmode');
    input.value = '';
    box.classList.remove('bad');
    if (!isTouch) setTimeout(() => input.focus({ preventScroll: true }), 600);

    input.oninput = () => { box.classList.remove('bad'); $('#gameError').textContent = ''; };
    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (won) return;
      if (!input.value.trim()) {
        $('#gameError').textContent = fmt(g.emptyMessage) || t('gameEmpty');
        shakeGameCard();
        return;
      }
      // pattern = a rule like "^14(\.6\d*)?$" for numbers; "14,6" is read as "14.6"
      const byPattern = g.pattern && new RegExp(g.pattern, 'i').test(input.value.trim().replace(',', '.'));
      const ok = byPattern || (g.answers || []).some(a => normAnswer(a) === normAnswer(input.value));
      if (!ok) {
        tries++;
        $('#gameError').textContent = fmt(g.wrongMessage) || t('gameWrong');
        box.classList.add('bad');
        shakeGameCard();
        if (g.hint && tries >= (g.hintAfterTries || 3)) {
          $('#gameHint').textContent = t('gameHintPrefix') + fmt(g.hint);
          $('#gameHint').classList.remove('hidden');
        }
        return;
      }
      won = true;
      gameWon(g, index, total, next);
    };
  }

  /* Game type "table": write the full multiplication table before the time runs out */
  function tableGame(g, index, total, next) {
    const n = Number(g.number) || 2, upto = Number(g.upto) || 10, secs = Number(g.seconds) || 60;
    const grid = $('#tableGrid'), bar = $('#gameTimer'), fill = $('#gameTimerFill'), label = $('#gameTimerText');
    let state = 'ready', endAt = 0, raf = 0;
    stopCurrentGame = () => { state = 'stopped'; cancelAnimationFrame(raf); };

    setupGameCard(g, index, total, ['table', 'timer']);
    grid.innerHTML = '';
    for (let k = 1; k <= upto; k++) {
      const row = document.createElement('div');
      row.className = 't-row';
      row.innerHTML = `<label for="t${k}">${n} × ${k} =</label><input id="t${k}" type="text" inputmode="numeric" maxlength="${String(n * k).length + 1}" autocomplete="off">`;
      grid.appendChild(row);
    }
    const inputs = $$('input', grid);
    const answerOf = i => String(n * (i + 1));
    const correct = () => inputs.filter((inp, i) => inp.value.trim() === answerOf(i)).length;

    const showTime = ms => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      label.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      fill.style.transform = `scaleX(${Math.max(0, ms / (secs * 1000))})`;
      bar.classList.toggle('low', state === 'running' && s <= 10);
    };

    function reset() {
      state = 'ready';
      cancelAnimationFrame(raf);
      inputs.forEach(inp => { inp.value = ''; inp.disabled = true; inp.parentNode.classList.remove('bad', 'good'); });
      $('#gameError').textContent = '';
      showTime(secs * 1000);
      start();                                            // timer runs as soon as the game opens
    }

    function start() {
      state = 'running';
      endAt = Date.now() + secs * 1000;
      inputs.forEach(inp => { inp.disabled = false; });
      $('#gameBtn').textContent = t('tableCheck');
      inputs[0].focus({ preventScroll: true });
      (function loop() {
        if (state !== 'running') return;
        const left = endAt - Date.now();
        showTime(left);
        if (left <= 0) return timeUp();
        raf = requestAnimationFrame(loop);
      })();
    }

    function timeUp() {
      state = 'over';
      inputs.forEach(inp => { inp.disabled = true; });
      if (document.activeElement) document.activeElement.blur();
      $('#gameError').textContent = t('tableTimeUp');
      $('#gameBtn').textContent = t('tableRetry');
      bar.classList.remove('low');
      shakeGameCard();
    }

    function win() {
      state = 'won';
      cancelAnimationFrame(raf);
      bar.classList.remove('low');
      inputs.forEach(inp => { inp.disabled = true; inp.parentNode.classList.add('good'); });
      gameWon(g, index, total, next);
    }

    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        inp.parentNode.classList.remove('bad');
        $('#gameError').textContent = '';
        // Jump to the next box once enough digits are typed (says nothing about right or wrong)
        if (inp.value.length >= answerOf(i).length && inputs[i + 1]) inputs[i + 1].focus({ preventScroll: true });
        if (correct() === inputs.length) win();
      });
    });

    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (state === 'ready') return start();
      if (state === 'over') return reset();
      if (state !== 'running') return;
      if (inputs.some(inp => !inp.value.trim())) {
        $('#gameError').textContent = t('tableEmpty');
        return;
      }
      const wrong = inputs.filter((inp, i) => inp.value.trim() !== answerOf(i));
      if (!wrong.length) return win();
      wrong.forEach(inp => inp.parentNode.classList.add('bad'));
      $('#gameError').textContent = t('tableWrong').replace('{count}', wrong.length);
      shakeGameCard();
    };

    reset();
  }

  /* Game type "quiz": questions one after another, every answer must be right */
  // Lower-case, drop spaces/punctuation (keeps Hindi letters): "Teddy Bear!" -> "teddybear"
  const squash = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function matches(input, answers, mode) {
    const v = squash(input);
    if (!v) return false;
    const list = (answers || []).map(squash).filter(Boolean);
    if (mode === 'contains') return list.some(a => v.includes(a));
    if (mode === 'number') {
      const num = (String(input).match(/\d+/) || [])[0];
      const nums = (answers || []).map(a => (String(a).match(/^\d+$/) || [])[0]).filter(Boolean);
      if (num && nums.some(x => Number(x) === Number(num))) return true;
    }
    return list.includes(v);
  }

  // "30 feb", "30/2", "31 february" -> "30/2"
  function parseDayMonth(text) {
    const s = String(text).toLowerCase();
    const nums = s.match(/\d+/g) || [];
    const day = nums[0] ? Number(nums[0]) : 0;
    let month = MONTH_WORDS.findIndex(m => s.includes(m)) + 1;
    if (!month && nums[1]) month = Number(nums[1]);
    return day && month ? `${day}/${month}` : '';
  }
  const dateOk = (dm, answers) => !!dm && (answers || []).some(a => {
    const [d, m] = String(a).split('/').map(Number);
    return dm === `${d}/${m}`;
  });

  // Which answer group (gift) an input belongs to; longer names checked first so "earring" is not read as "ring"
  function groupOf(input, groups) {
    const v = squash(input);
    if (!v) return -1;
    const flat = [];
    groups.forEach((names, gi) => [].concat(names).forEach(n => flat.push({ n: squash(n), gi })));
    flat.sort((a, b) => b.n.length - a.n.length);
    const hit = flat.find(f => f.n && v.includes(f.n));
    return hit ? hit.gi : -1;
  }

  function quizGame(g, index, total, next) {
    const qs = g.questions || [];
    const area = $('#quizArea');
    let qi = 0, busy = false, timer = 0;
    stopCurrentGame = () => clearTimeout(timer);

    setupGameCard(g, index, total, ['quiz']);
    if (!qs.length) return gameWon(g, index, total, next);

    const fieldHtml = (ph, mode) => `<label class="field-box"><input class="quiz-in" type="text"${mode ? ` inputmode="${esc(mode)}"` : ''} placeholder=" " autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"><span class="ph">${esc(ph)}</span></label>`;

    function renderTop() {
      const dots = qs.map((_, k) => `<i class="${k < qi ? 'done' : k === qi ? 'now' : ''}"></i>`).join('');
      return `<div class="quiz-top"><span class="quiz-dots">${dots}</span><span class="quiz-count">${esc(t('quizStep').replace('{n}', qi + 1).replace('{total}', qs.length))}</span></div>`;
    }

    function renderDatePick() {
      const months = t('quizMonths').split('|');
      const days = Array.from({ length: 31 }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('');
      const mons = months.map((m, k) => `<option value="${k + 1}">${esc(m)}</option>`).join('');
      return `<div class="date-pick"><select id="qDay"><option value="">${esc(t('quizDay'))}</option>${days}</select><select id="qMonth"><option value="">${esc(t('quizMonth'))}</option>${mons}</select></div>`;
    }

    function showQuestion() {
      const q = qs[qi];
      q._tries = 0;
      q._dateMode = false;
      $('#gameQuestion').textContent = fmt(q.q);
      $('#gameHint').classList.add('hidden');
      $('#gameError').textContent = '';
      $('#gameError').classList.remove('quiz-ok');
      $('#gameBtn').textContent = t('gameBtn');
      $('#gameBtn').classList.toggle('hidden', q.kind === 'choice');
      let body;
      if (q.kind === 'choice') {
        body = `<div class="choice-grid">${(q.options || []).map((o, k) =>
          `<button type="button" class="choice" data-i="${k}"><b>${'ABCDEFGH'[k] || k + 1}</b><span>${esc(fmt(o))}</span></button>`).join('')}</div>`;
      } else if (q.kind === 'multi') {
        const n = Number(q.fields) || 3;
        body = Array.from({ length: n }, (_, k) => fieldHtml(fmt(q.placeholder || '').replace('{n}', k + 1))).join('');
      } else {
        body = fieldHtml(fmt(q.placeholder || ''), q.inputMode);
      }
      area.innerHTML = renderTop() + `<div class="quiz-fields">${body}</div>`;
      bindInputs();
      $$('.choice', area).forEach(btn => btn.addEventListener('click', () => pickOption(q, btn)));
      gsap.fromTo(['#gameQuestion', area], { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'power2.out' });
      const first = $('.quiz-in, select', area);
      if (first && !isTouch) setTimeout(() => first.focus({ preventScroll: true }), 350);
    }

    function bindInputs() {
      $$('.quiz-in, select', area).forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        el.classList.remove('bad');
        const box = el.closest('.field-box');
        if (box) box.classList.remove('bad');
        $('#gameError').textContent = '';
      }));
    }

    // Tap an option: right → green and next question; wrong → that option turns red and locks
    function pickOption(q, btn) {
      if (busy || btn.disabled) return;
      const picked = (q.options || [])[Number(btn.dataset.i)];
      const ok = !q.answer || squash(picked) === squash(q.answer);
      if (ok) {
        $$('.choice', area).forEach(b => { b.disabled = true; });
        btn.classList.add('good');
        return correct();
      }
      btn.classList.add('bad');
      btn.disabled = true;
      wrong(t('gameWrong'), []);
      q._tries++;
      if (q.hint && q._tries >= (q.hintAfterTries || 1)) {
        $('#gameHint').textContent = t('gameHintPrefix') + fmt(q.hint);
        $('#gameHint').classList.remove('hidden');
      }
    }

    function switchToDate(q) {
      q._dateMode = true;
      $('.quiz-fields', area).innerHTML = renderDatePick();
      bindInputs();
      gsap.from('.date-pick', { scale: 0.85, opacity: 0, duration: 0.5, ease: 'back.out(1.7)' });
    }

    function wrong(msg, els) {
      $('#gameError').classList.remove('quiz-ok');
      $('#gameError').textContent = msg;
      els.forEach(el => (el.closest('.field-box') || el).classList.add('bad'));
      shakeGameCard();
    }

    function correct() {
      busy = true;
      const q = qs[qi];
      if (document.activeElement) document.activeElement.blur();
      $('#gameHint').classList.add('hidden');
      $('#gameError').textContent = q.correctText ? fmt(q.correctText) : t('quizCorrect');
      $('#gameError').classList.add('quiz-ok');
      heartBurst(0.5, 0.5, 14);
      timer = setTimeout(() => {
        busy = false;
        qi++;
        if (qi >= qs.length) {
          $('#gameError').textContent = '';
          $('#gameError').classList.remove('quiz-ok');
          area.innerHTML = renderTop();
          return gameWon(g, index, total, next);
        }
        showQuestion();
      }, q.correctText ? 2200 : 900);   // give her time to read a special message
    }

    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (busy) return;
      const q = qs[qi];
      const inputs = $$('.quiz-in', area);

      // Date question, picker mode
      if (q.kind === 'date' && q._dateMode) {
        const d = $('#qDay').value, m = $('#qMonth').value;
        if (!d || !m) return wrong(t('gameEmpty'), [!d && $('#qDay'), !m && $('#qMonth')].filter(Boolean));
        return dateOk(`${Number(d)}/${Number(m)}`, q.answers) ? correct() : wrong(t('gameWrong'), [$('#qDay'), $('#qMonth')]);
      }

      const empty = inputs.filter(i => !i.value.trim());
      if (empty.length) return wrong(t('gameEmpty'), empty);

      if (q.kind === 'multi') {
        const groups = inputs.map(i => groupOf(i.value, q.answers || []));
        const bad = inputs.filter((i, k) => groups[k] < 0);
        if (bad.length) return wrong(t('quizMultiWrong').replace('{count}', bad.length), bad);
        if (q.distinct !== false) {
          const seen = new Set();
          const dupes = inputs.filter((i, k) => (seen.has(groups[k]) ? true : (seen.add(groups[k]), false)));
          if (dupes.length) return wrong(t('quizMultiSame'), dupes);
        }
        return correct();
      }

      if (q.kind === 'date') {
        if (dateOk(parseDayMonth(inputs[0].value), q.answers)) return correct();
        q._tries++;
        wrong(t('gameWrong'), inputs);
        if (q._tries >= (q.hintAfterTries || 3)) {
          $('#gameHint').textContent = t('gameHintPrefix') + fmt(q.hint || '');
          $('#gameHint').classList.remove('hidden');
          switchToDate(q);
        }
        return;
      }

      if (matches(inputs[0].value, q.answers, q.match)) return correct();
      q._tries++;
      wrong(t('gameWrong'), inputs);
      if (q.hint && q._tries >= (q.hintAfterTries || 3)) {
        $('#gameHint').textContent = t('gameHintPrefix') + fmt(q.hint);
        $('#gameHint').classList.remove('hidden');
      }
    };

    showQuestion();
  }

  /* Game type "puzzle": flip every card, then swap pieces until the photo is complete */
  function puzzleGame(g, index, total, next) {
    const n = Math.max(2, Math.min(6, Number(g.grid) || 3)), N = n * n;
    const board = $('#puzzleBoard'), status = $('#puzzleStatus'), peek = $('#puzzlePeek');
    const timers = [];
    let opened = 0, sel = -1, solved = false;
    stopCurrentGame = () => timers.forEach(clearTimeout);

    // Shuffle so that no piece starts in its own place
    let order, guard = 0;
    do {
      order = Array.from({ length: N }, (_, k) => k);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    } while (order.some((p, i) => p === i) && ++guard < 200);

    setupGameCard(g, index, total, ['puzzle']);
    new Image().src = g.image;   // preload
    board.style.setProperty('--n', n);
    board.classList.remove('solved');
    peek.src = g.image;
    peek.classList.remove('show');
    const peekSecs = g.peekSeconds == null ? 2 : Number(g.peekSeconds);
    $('#gameBtn').textContent = t('puzzlePeek');
    $('#gameBtn').classList.toggle('hidden', !peekSecs);

    board.innerHTML = order.map((_, slot) =>
      `<div class="p-card" data-slot="${slot}"><div class="p-inner"><div class="p-face p-back"></div><div class="p-face p-front"></div></div></div>`).join('');
    const cards = $$('.p-card', board);
    const allOpen = () => opened >= N;
    const rightCount = () => order.filter((p, i) => p === i).length;

    function paint(slot) {
      const f = $('.p-front', cards[slot]), p = order[slot];
      f.style.backgroundImage = `url("${g.image}")`;
      f.style.backgroundSize = `${n * 100}% ${n * 100}%`;
      f.style.backgroundPosition = `${(p % n) * 100 / (n - 1)}% ${Math.floor(p / n) * 100 / (n - 1)}%`;
      cards[slot].classList.toggle('right', g.showCorrect !== false && allOpen() && !solved && p === slot);
    }
    function updateStatus() {
      status.textContent = allOpen()
        ? t('puzzlePlace').replace('{n}', rightCount()).replace('{total}', N)
        : t('puzzleFlipped').replace('{n}', opened).replace('{total}', N);
    }
    cards.forEach((_, s) => paint(s));
    updateStatus();

    board.onclick = e => {
      const card = e.target.closest('.p-card');
      if (!card || solved) return;
      const slot = Number(card.dataset.slot);

      // Phase 1: flip the cards open
      if (!card.classList.contains('open')) {
        card.classList.add('open');
        opened++;
        if (allOpen()) cards.forEach((_, s) => paint(s));
        updateStatus();
        return;
      }
      if (!allOpen()) return;

      // Phase 2: tap one, tap another → they swap
      if (sel === -1) { sel = slot; card.classList.add('sel'); return; }
      if (sel === slot) { card.classList.remove('sel'); sel = -1; return; }
      const a = sel, b = slot;
      cards[a].classList.remove('sel');
      sel = -1;
      [order[a], order[b]] = [order[b], order[a]];
      paint(a); paint(b);
      gsap.fromTo([cards[a], cards[b]], { scale: 0.82 }, { scale: 1, duration: 0.35, ease: 'back.out(2.2)' });
      updateStatus();
      if (rightCount() === N) {
        solved = true;
        cards.forEach(c => c.classList.remove('right'));
        board.classList.add('solved');
        // Fade the real photo over the pieces so no seams remain
        timers.push(setTimeout(() => peek.classList.add('show'), 600));
        burst();
        heartBurst(0.5, 0.45, 40);
        timers.push(setTimeout(() => gameWon(g, index, total, next), 1400));
      }
    };

    // The button shows the full photo for a moment as a reference
    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (solved || !peekSecs) return;
      peek.classList.add('show');
      timers.push(setTimeout(() => peek.classList.remove('show'), peekSecs * 1000));
    };
  }

  /* Game type "catch": hearts fall from the top, catch them in the basket before the time runs out */
  function catchGame(g, index, total, next) {
    const secs = Number(g.seconds) || 60, target = Number(g.target) || 500;
    const items = (g.items || []).filter(it => Number(it.chance) > 0);
    const chanceSum = items.reduce((s, it) => s + Number(it.chance), 0);
    const canvas = $('#catchCanvas'), ctx = canvas.getContext('2d');
    const stage = $('.catch-stage'), overlay = $('#catchOverlay');
    const scoreEl = $('#catchScore'), timeEl = $('#catchTime');
    let state = 'ready', score = 0, endAt = 0, raf = 0, last = 0, spawnIn = 0;
    let W = 0, H = 0, basketX = 0, keyDir = 0;
    let drops = [], pops = [], cheered = false;
    const timers = [];
    const cleanup = () => {
      state = 'stopped';
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('resize', resize);
    };
    stopCurrentGame = cleanup;

    setupGameCard(g, index, total, ['catch']);
    $('#catchLegend').innerHTML = items.map(it =>
      `<span>${esc(it.emoji)} <b>${it.points === 'zero' ? '= 0' : (it.points > 0 ? '+' : '') + it.points}</b></span>`).join('');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!basketX) basketX = W / 2;
      draw();
    }
    const basketW = () => Math.max(70, Math.min(110, W * 0.26));
    const itemSize = () => Math.max(26, Math.min(40, W * 0.1));

    function hud() {
      scoreEl.textContent = `⭐ ${score} / ${target}`;
      const left = state === 'running' ? Math.max(0, endAt - Date.now()) : secs * 1000;
      const s = Math.ceil(left / 1000);
      timeEl.textContent = `⏱️ ${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      timeEl.classList.toggle('low', state === 'running' && s <= 10);
    }

    function say(text, cls, keep) {
      overlay.textContent = text;
      overlay.className = 'catch-overlay show' + (cls ? ' ' + cls : '');
      if (!keep) timers.push(setTimeout(() => { if (overlay.textContent === text) overlay.className = 'catch-overlay'; }, 900));
    }

    function pickItem() {
      let r = Math.random() * chanceSum;
      for (const it of items) { r -= Number(it.chance); if (r <= 0) return it; }
      return items[0];
    }

    function drawBasket() {
      const bw = basketW(), bh = bw * 0.48, x = basketX - bw / 2, y = H - bh - 8;
      ctx.save();
      ctx.fillStyle = '#b5652b';
      ctx.beginPath();
      ctx.moveTo(x, y + 6); ctx.lineTo(x + bw, y + 6);
      ctx.lineTo(x + bw * 0.86, y + bh); ctx.lineTo(x + bw * 0.14, y + bh); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 35, 10, .55)'; ctx.lineWidth = 2;
      for (let k = 1; k < 5; k++) { const yy = y + 6 + (bh - 6) * k / 5; ctx.beginPath(); ctx.moveTo(x + bw * 0.05, yy); ctx.lineTo(x + bw * 0.95, yy); ctx.stroke(); }
      for (let k = 1; k < 6; k++) { const xx = x + bw * k / 6; ctx.beginPath(); ctx.moveTo(xx, y + 6); ctx.lineTo(x + bw * 0.14 + (bw * 0.72) * k / 6, y + bh); ctx.stroke(); }
      ctx.fillStyle = '#ff4d8d';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 4, y, bw + 8, 9, 5) : ctx.rect(x - 4, y, bw + 8, 9); ctx.fill();
      ctx.font = `${Math.round(bh * 0.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💘', basketX, y + bh * 0.58);
      ctx.restore();
      return { x, y, w: bw };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = itemSize();
      ctx.font = `${size}px sans-serif`;
      drops.forEach(d => { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.fillText(d.it.emoji, 0, 0); ctx.restore(); });
      drawBasket();
      pops.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.font = `bold ${Math.round(size * 0.6)}px Poppins, sans-serif`;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      });
    }

    function catchItem(d) {
      const it = d.it;
      if (it.points === 'zero') {
        score = 0;
        stage.classList.remove('boom'); void stage.offsetWidth; stage.classList.add('boom');
        if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
        say(fmt(g.bombText) || '💣 BOOM!', '');
        pops.push({ x: d.x, y: d.y, text: '0', color: '#ff3355', life: 1 });
      } else {
        const pts = Number(it.points) || 0;
        score = Math.max(0, score + pts);
        pops.push({ x: d.x, y: d.y - 10, text: (pts > 0 ? '+' : '') + pts, color: pts >= 0 ? '#ffd27a' : '#ff8a9a', life: 1 });
        if (pts < 0 && navigator.vibrate) navigator.vibrate(60);
      }
      hud();
      if (score >= target) {
        if (!g.playFullTime) return win();
        // Keep playing till the end; just cheer once when the target is crossed
        if (!cheered) { cheered = true; say(fmt(g.targetReachedText || '🎯').replace('{target}', target), 'win'); }
      } else {
        cheered = false;
      }
    }

    function frame(ts) {
      if (state !== 'running') return;
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
      last = ts;
      const left = endAt - Date.now();
      const progress = 1 - Math.max(0, left) / (secs * 1000);       // 0 → 1, game gets faster
      if (keyDir) basketX = Math.max(basketW() / 2, Math.min(W - basketW() / 2, basketX + keyDir * W * 1.1 * dt));

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const size = itemSize();
        drops.push({ it: pickItem(), x: size / 2 + Math.random() * (W - size), y: -size, rot: (Math.random() - 0.5) * 0.5,
          vy: (H / 420) * (160 + 170 * progress) * (0.85 + Math.random() * 0.3) });
        spawnIn = 0.62 - 0.27 * progress;
      }

      const b = { x: basketX - basketW() / 2, w: basketW(), top: H - basketW() * 0.48 - 8 };
      const size = itemSize();
      drops = drops.filter(d => {
        d.y += d.vy * dt;
        if (d.y + size * 0.35 >= b.top && d.y - size * 0.35 <= b.top + 18 && d.x >= b.x - size * 0.2 && d.x <= b.x + b.w + size * 0.2) {
          catchItem(d);
          return false;
        }
        return d.y < H + size;
      });
      pops = pops.filter(p => { p.y -= 40 * dt; p.life -= 1.3 * dt; return p.life > 0; });

      hud();
      draw();
      if (state !== 'running') return;
      if (left <= 0) return timeUp();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      state = 'running';
      score = 0; drops = []; pops = []; last = 0; spawnIn = 0.4; cheered = false;
      endAt = Date.now() + secs * 1000;
      $('#gameError').textContent = '';
      $('#gameBtn').classList.add('hidden');
      say(t('catchGo'), '');
      hud();
      raf = requestAnimationFrame(frame);
    }

    function timeUp() {
      if (score >= target) return win();
      state = 'over';
      drops = [];
      draw();
      const tier = (g.results || []).find(r => score >= Number(r.min)) || { text: '' };
      say(`⭐ ${score}\n${fmt(tier.text)}`, '', true);
      overlay.style.whiteSpace = 'pre-line';
      $('#gameBtn').textContent = t('catchRetry');
      $('#gameBtn').classList.remove('hidden');
      hud();
    }

    function win() {
      state = 'won';
      cancelAnimationFrame(raf);
      drops = [];
      draw();
      overlay.style.whiteSpace = 'normal';
      say(fmt(g.winText), 'win', true);
      burst();
      sideCannons(2000);
      timers.push(setTimeout(() => gameWon(g, index, total, next), 2600));
    }

    // Controls: drag / move a finger or mouse, or use the arrow keys
    const moveTo = e => {
      if (state !== 'running') return;
      const r = canvas.getBoundingClientRect();
      basketX = Math.max(basketW() / 2, Math.min(W - basketW() / 2, e.clientX - r.left));
    };
    canvas.onpointerdown = e => { canvas.setPointerCapture(e.pointerId); moveTo(e); };
    canvas.onpointermove = moveTo;
    function onKey(e) {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.type === 'keydown') keyDir = e.key === 'ArrowLeft' ? -1 : 1;
      else if ((e.key === 'ArrowLeft' && keyDir < 0) || (e.key === 'ArrowRight' && keyDir > 0)) keyDir = 0;
      if (state === 'running') e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('resize', resize);

    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (state === 'ready' || state === 'over') start();
    };

    $('#gameBtn').textContent = t('catchStart');
    overlay.style.whiteSpace = 'normal';
    requestAnimationFrame(() => {
      resize(); hud();
      $('#gameBtn').classList.add('hidden');
      say(t('catchHow'), '', true);
      ['3', '2', '1'].forEach((n, k) => timers.push(setTimeout(() => say(n, 'win', true), 1400 + k * 700)));
      timers.push(setTimeout(start, 1400 + 3 * 700));
    });
  }

  /* Game type "kiss": tap the mic and make a kiss sound ("mwah"). A short, sharp burst of sound counts. */
  function kissGame(g, index, total, next) {
    const needed = Math.max(1, Number(g.kissesNeeded) || 1);
    const mic = $('#kissMic'), level = $('#kissLevel'), status = $('#kissStatus'), tap = $('#kissTap'), burstBox = $('#kissBurst');
    let got = 0, done = false, stream = null, audioCtx = null, raf = 0;
    const timers = [];

    let musicWas = false;
    function stopMic() {
      if (musicWas) { musicWas = false; audio.play().catch(() => {}); musicBtn.classList.add('playing'); }
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(tr => tr.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      stream = null; audioCtx = null;
      mic.classList.remove('listening');
      level.style.width = '0';
    }
    stopCurrentGame = () => { stopMic(); timers.forEach(clearTimeout); done = true; };

    setupGameCard(g, index, total, ['kiss']);
    $('#gameBtn').classList.add('hidden');
    status.textContent = t('kissTapMic');
    status.classList.remove('done');
    tap.textContent = t('kissFallback');
    tap.classList.add('hidden');
    burstBox.innerHTML = '';
    mic.disabled = false;

    function flyKisses(n) {
      const icons = ['💋', '😘', '💕', '💖', '😍'];
      for (let k = 0; k < n; k++) {
        const s = document.createElement('span');
        s.className = 'kiss-fly';
        s.textContent = icons[k % icons.length];
        s.style.left = rand(10, 90) + '%';
        s.style.setProperty('--dx', rand(-60, 60) + 'px');
        s.style.setProperty('--rot', rand(-40, 40) + 'deg');
        s.style.animationDelay = (k * 0.06) + 's';
        burstBox.appendChild(s);
        timers.push(setTimeout(() => s.remove(), 2200));
      }
    }

    function onKiss() {
      if (done) return;
      got++;
      flyKisses(8);
      if (navigator.vibrate) navigator.vibrate(60);
      if (got < needed) {
        status.textContent = t('kissMore').replace('{n}', got).replace('{total}', needed);
        return;
      }
      done = true;
      stopMic();
      mic.disabled = true;
      tap.classList.add('hidden');
      status.textContent = fmt(g.successText);
      status.classList.add('done');
      flyKisses(18);
      heartBurst(0.5, 0.5, 40);
      timers.push(setTimeout(() => gameWon(g, index, total, next), 1800));
    }

    function showFallback(msg) {
      if (done) return;
      if (msg) status.textContent = msg;
      tap.classList.remove('hidden');
      gsap.fromTo(tap, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' });
    }

    async function startMic() {
      if (done || stream) return;
      if (!audio.paused) { musicWas = true; audio.pause(); musicBtn.classList.remove('playing'); }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showFallback(t('kissNoMic'));
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        stream = null;
        return showFallback(t('kissDenied'));
      }
      if (done) return stopMic();
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const an = audioCtx.createAnalyser();
      an.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      const sens = Number(g.sensitivity) || 0.1;
      mic.classList.add('listening');
      status.textContent = t('kissListening');

      // Learn the room's background noise for a moment, then look for a short loud burst
      let noise = 0.02, frames = 0, loud = 0, cooldown = 0;
      (function listen() {
        if (!stream) return;
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / data.length);
        level.style.width = Math.min(100, rms * 400) + '%';
        frames++;
        if (frames < 20) noise = Math.max(noise, rms);
        const threshold = Math.max(sens, noise * 3);
        if (cooldown > 0) cooldown--;
        else if (rms > threshold) loud++;
        else {
          if (loud >= 2) { onKiss(); cooldown = 30; }   // a burst just ended: that was a kiss
          loud = 0;
        }
        if (loud > 90) loud = 0;                          // ignore long continuous noise
        raf = requestAnimationFrame(listen);
      })();

      const wait = Number(g.fallbackAfterSeconds);
      if (wait > 0) timers.push(setTimeout(() => showFallback(), wait * 1000));
    }

    mic.onclick = startMic;
    tap.onclick = onKiss;
    $('#gameForm').onsubmit = e => e.preventDefault();
  }

  /* Game type "cards": 3 face-down cards get shuffled; the first picks are always "wrong" (funny messages),
     on the winning try any card holds the surprise and a video plays */
  function cardsGame(g, index, total, next) {
    const table = $('#cardsTable'), msg = $('#cardsMsg'), tryEl = $('#cardsTry');
    const winOn = Math.max(1, Number(g.winOnTry) || 10);
    const wrongs = (g.wrongMessages || []).length ? g.wrongMessages : [t('gameWrong')];
    const shuffleMs = (Number(g.shuffleSeconds) || 2) * 1000;
    const LEFT = ['0%', '35%', '70%'];
    const timers = [];
    let state = 'ready', tries = 0, slots = [0, 1, 2];   // slots[cardIndex] = position

    stopCurrentGame = () => { state = 'stopped'; timers.forEach(clearTimeout); gsap.killTweensOf('.s-card'); closeVideo(true); };
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    setupGameCard(g, index, total, ['cards']);
    table.innerHTML = [0, 1, 2].map(k =>
      `<div class="s-card" data-k="${k}" style="left:${LEFT[k]}"><div class="s-inner"><div class="s-face s-back"></div><div class="s-face s-front"></div></div></div>`).join('');
    const cards = $$('.s-card', table);
    msg.textContent = '';
    msg.classList.remove('win');
    tryEl.textContent = '';
    $('#gameBtn').textContent = t('cardsStart');

    // Swap two cards at a time; each swap arcs one card up and the other down
    function shuffle(done) {
      state = 'shuffling';
      table.classList.remove('picking');
      if (!msg.textContent || msg.textContent === t('cardsPick')) msg.textContent = t('cardsShuffling');
      const swaps = 7, each = shuffleMs / swaps / 1000;
      const tl = gsap.timeline({ onComplete: () => { if (state !== 'stopped') done(); } });
      for (let s = 0; s < swaps; s++) {
        let a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
        const ca = slots.indexOf(a), cb = slots.indexOf(b);
        slots[ca] = b; slots[cb] = a;
        tl.add([
          gsap.to(cards[ca], { left: LEFT[b], duration: each, ease: 'power1.inOut' }),
          gsap.to(cards[ca], { keyframes: [{ y: -26 }, { y: 0 }], duration: each, ease: 'sine.inOut' }),
          gsap.to(cards[cb], { left: LEFT[a], duration: each, ease: 'power1.inOut' }),
          gsap.to(cards[cb], { keyframes: [{ y: 22 }, { y: 0 }], duration: each, ease: 'sine.inOut' })
        ]);
      }
    }

    function readyToPick() {
      state = 'pick';
      table.classList.add('picking');
      tryEl.textContent = t('cardsTry').replace('{n}', tries + 1);
      if (!tries) msg.textContent = t('cardsPick');
    }

    function pick(card) {
      if (state !== 'pick') return;
      state = 'reveal';
      table.classList.remove('picking');
      tries++;
      const front = $('.s-front', card);
      if (tries < winOn) {
        front.textContent = '😜';
        card.classList.add('open');
        msg.textContent = fmt(wrongs[(tries - 1) % wrongs.length]);
        gsap.fromTo(msg, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' });
        if (navigator.vibrate) navigator.vibrate(80);
        later(() => {
          card.classList.remove('open');
          later(() => shuffle(readyToPick), 650);
        }, 1700);
        return;
      }
      // Winning try: whichever card she picked has the surprise
      front.textContent = '🎁';
      card.classList.add('open', 'win');
      tryEl.textContent = '';
      msg.textContent = fmt(g.winText);
      msg.classList.add('win');
      burst();
      heartBurst(0.5, 0.45, 40);
      later(() => (g.video ? openVideo() : gameWon(g, index, total, next)), 1800);
    }

    // Prize video in a full-screen popup; site music pauses while it plays
    let musicWasPlaying = false;
    const video = $('#surpriseVideo'), modal = $('#videoModal'), actions = $('#videoActions');
    function openVideo() {
      musicWasPlaying = !audio.paused;
      if (musicWasPlaying) { audio.pause(); musicBtn.classList.remove('playing'); }
      actions.classList.add('hidden');
      modal.classList.remove('hidden');
      gsap.fromTo('.video-box', { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' });
      getMedia(g.video).then(url => {
        if (modal.classList.contains('hidden')) return;
        video.src = url;
        video.muted = false;     // always start with sound on
        video.volume = 1;
        video.currentTime = 0;
        video.play().catch(() => {});
      });
    }
    function closeVideo(silent) {
      video.pause();
      modal.classList.add('hidden');
      if (musicWasPlaying && !silent) { audio.play().catch(() => {}); musicBtn.classList.add('playing'); }
      musicWasPlaying = false;
    }
    video.onended = () => actions.classList.remove('hidden');
    video.onerror = () => actions.classList.remove('hidden');
    $('#videoAgain').onclick = () => { actions.classList.add('hidden'); video.currentTime = 0; video.play().catch(() => {}); };
    $('#videoNext').onclick = () => {
      closeVideo(false);
      gameWon(g, index, total, next);
    };

    table.onclick = e => { const c = e.target.closest('.s-card'); if (c) pick(c); };
    $('#gameForm').onsubmit = e => {
      e.preventDefault();
      if (state !== 'ready') return;
      $('#gameBtn').classList.add('hidden');
      shuffle(readyToPick);
    };
  }

  /* Game type "dice": keep rolling until a 6 comes up */
  function diceGame(g, index, total, next) {
    const dice = $('#dice'), scene = $('.dice-scene'), msg = $('#diceMsg'), count = $('#diceCount');
    const guarantee = Number(g.guaranteeSixAfter) || 0;
    const tries = (g.tryMessages || []).length ? g.tryMessages : ['{n}'];
    // Which pips are lit on a 3×3 grid for each face
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    // Cube rotation that brings each face to the front (plus a small tilt so it still looks 3D)
    const FACE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
    const TILT = [-18, 24];
    let rolls = 0, busy = false, won = false, spinX = 0, spinY = 0;
    const timers = [];
    stopCurrentGame = () => { won = true; timers.forEach(clearTimeout); gsap.killTweensOf(dice); };

    setupGameCard(g, index, total, ['dice']);
    dice.innerHTML = [1, 2, 3, 4, 5, 6].map(n =>
      `<div class="dice-face f${n}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[n].includes(k) ? 'on' : ''}"></i>`).join('')}</div>`).join('');
    scene.classList.remove('won');
    msg.textContent = '';
    msg.classList.remove('win');
    count.textContent = '';
    gsap.set(dice, { rotationX: TILT[0] - 10, rotationY: TILT[1] + 15 });
    $('#gameBtn').textContent = t('diceRoll');

    function roll() {
      if (busy || won) return;
      busy = true;
      rolls++;
      const n = guarantee && rolls >= guarantee ? 6 : 1 + Math.floor(Math.random() * 6);
      spinX += 2 + Math.floor(Math.random() * 2);
      spinY += 2 + Math.floor(Math.random() * 2);
      count.textContent = t('diceCount').replace('{n}', rolls);
      msg.textContent = t('diceRolling');
      $('#gameBtn').disabled = true;
      gsap.timeline({
        onComplete: () => {
          busy = false;
          $('#gameBtn').disabled = false;
          if (n === 6) return win();
          msg.textContent = fmt(tries[(rolls - 1) % tries.length]).replace(/\{n\}/g, n);
          gsap.fromTo(msg, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' });
          if (navigator.vibrate) navigator.vibrate(40);
        }
      })
        .to(scene, { y: -40, duration: 0.35, ease: 'power2.out' })
        .to(dice, {
          rotationX: spinX * 360 + FACE[n][0] + TILT[0],
          rotationY: spinY * 360 + FACE[n][1] + TILT[1],
          duration: 1.2, ease: 'power3.out'
        }, 0)
        .to(scene, { y: 0, duration: 0.5, ease: 'bounce.out' }, 0.45);
    }

    function win() {
      won = true;
      scene.classList.add('won');
      msg.textContent = fmt(g.winText);
      msg.classList.add('win');
      burst();
      heartBurst(0.5, 0.45, 30);
      timers.push(setTimeout(() => gameWon(g, index, total, next), 1800));
    }

    scene.onclick = roll;
    $('#gameForm').onsubmit = e => { e.preventDefault(); roll(); };
  }

  // Has the birthday moment arrived? (or the secret preview key is used)
  function isUnlocked() {
    const params = new URLSearchParams(location.search);
    const preview = C.event.previewKey ? params.get('preview') === C.event.previewKey : params.has('preview');
    return !C.event.lockUntilDate || preview || now() >= new Date(C.event.date).getTime();
  }

  /* ---------------- Lucky draw (after the lock, before the countdown) ----------------
     Face-down cards, a few tries; the layout and every pick are saved so a reload can't re-roll. */
  const loadLucky = () => { try { return JSON.parse(store.get(KEY_LUCKY)) || null; } catch (e) { return null; } };
  const saveLucky = st => store.set(KEY_LUCKY, JSON.stringify(st));

  function afterLock() {
    const L = C.luckyDraw;
    if (L && (L.picks || []).length) showLuckyDraw();
    else goToCountdown();
  }

  function showLuckyDraw() {
    const L = C.luckyDraw;
    const picks = L.picks || [];
    const missed = L.missed || [];
    const tries = picks.length;
    const total = Math.max(15, tries + missed.length);
    let st = loadLucky();
    if (!st || typeof st.picksDone !== 'number') { st = { picksDone: 0, done: false }; saveLucky(st); }

    const el = $('#luckyDraw'), grid = $('#luckyGrid'), msg = $('#luckyMsg'), summary = $('#luckySummary'), nextBtn = $('#luckyNext');
    const tray = $('#luckyTray');
    el.classList.remove('hidden');
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    msg.textContent = '';
    msg.classList.remove('win');
    summary.classList.add('hidden');
    nextBtn.classList.add('hidden');
    $('#luckySend').classList.add('hidden');

    // Card faces are only written when a card is turned, so nothing can be peeked at beforehand
    grid.innerHTML = Array.from({ length: total }, () =>
      '<div class="l-card"><div class="l-inner"><div class="l-face l-back"></div><div class="l-face l-front"></div></div></div>').join('');
    const cardEls = () => $$('.l-card', grid);
    const won = () => picks.slice(0, st.picksDone).filter(c => c.prize);
    const showTries = () => { $('#luckyTries').textContent = t('luckyTries').replace('{n}', tries - st.picksDone).replace('{total}', tries); };
    const showTray = () => {
      const w = won();
      tray.innerHTML = w.map(c => `<span class="lucky-chip">${esc(c.emoji || '')} ${esc(fmt(c.text))}</span>`).join('');
      tray.classList.toggle('hidden', !w.length);
    };
    const faceHtml = c => `<div class="e">${esc(c.emoji || '')}</div>` +
      (c.title ? `<b>${esc(fmt(c.title))}</b><span>${esc(fmt(c.text))}</span>` : `<b>${esc(fmt(c.text))}</b>`);

    function turn(card, c, extra) {
      $('.l-front', card).innerHTML = faceHtml(c);
      card.classList.add('open');
      (extra || []).forEach(x => card.classList.add(x));
    }
    function unturn(card) {
      card.classList.remove('open', 'prize', 'nothing');
      setTimeout(() => { $('.l-front', card).innerHTML = ''; }, 650);
    }

    // Shuffle animation: cards change places in the grid (FLIP technique), with a little hop
    function shuffleCards(done) {
      msg.classList.remove('win');
      msg.textContent = t('luckyShuffling');
      const cards = cardEls();
      const before = cards.map(c => c.getBoundingClientRect());
      shuffled(cards).forEach(c => grid.appendChild(c));
      const after = cards.map(c => c.getBoundingClientRect());
      const tl = gsap.timeline({ onComplete: () => { cards.forEach(c => gsap.set(c, { clearProps: 'transform' })); done(); } });
      cards.forEach((c, i) => {
        tl.fromTo(c, { x: before[i].left - after[i].left, y: before[i].top - after[i].top, rotation: (Math.random() - 0.5) * 30 },
          { x: 0, y: 0, rotation: 0, duration: 0.9, ease: 'power3.inOut' }, Math.random() * 0.25);
      });
    }

    let busy = true;
    function readyToPick() {
      busy = false;
      grid.classList.add('picking');
      msg.textContent = t('luckyPick');
    }

    function finish(restored) {
      st.done = true;
      saveLucky(st);
      busy = true;
      grid.classList.remove('picking');
      // Turn every card over: her prizes + the big vouchers she "missed" 😜
      const faces = shuffled(picks.map(c => ({ c, mine: true })).concat(missed.map(c => ({ c, mine: false }))));
      cardEls().forEach((card, i) => {
        const f = faces[i % faces.length];
        setTimeout(() => turn(card, f.c, f.mine ? (f.c.prize ? ['prize', 'mine'] : ['nothing']) : (f.c.title ? ['fake'] : ['nothing', 'missed'])), restored ? 0 : i * 70);
      });
      msg.classList.remove('win');
      msg.textContent = t('luckyMissed');
      const w = won();
      const sum = w.reduce((s, c) => s + (parseInt(String(c.text).replace(/\D/g, ''), 10) || 0), 0);
      summary.innerHTML = w.length
        ? `<h3>${esc(t('luckyWonTitle').replace('{n}', w.length))}</h3><ul>${w.map(c => `<li>${esc(c.emoji || '')} ${esc(fmt(c.title))}: ${esc(fmt(c.text))}</li>`).join('')}</ul>` +
          `<p class="lucky-total">${esc(t('luckyTotal').replace('{sum}', '₹' + sum))}</p><p>${esc(t('luckyWonNote'))}</p>`
        : `<p>${esc(t('luckyNone'))}</p>`;
      setTimeout(() => {
        summary.classList.remove('hidden');
        gsap.fromTo(summary, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });
        if (!restored && w.length) { burst(); sideCannons(1500); }
        afterSummary(w);
      }, restored ? 0 : total * 70 + 500);
    }

    const leave = () => gsap.to(el, { opacity: 0, duration: 0.5, onComplete: () => { el.classList.add('hidden'); goToCountdown(); } });
    function afterSummary(w) {
      const send = $('#luckySend');
      if (w.length && !st.sent) {
        const list = w.map(c => `${fmt(c.title)} ${fmt(c.text)}`).join(', ');
        const text = encodeURIComponent(t('luckyWhatsAppMsg').replace('{list}', list));
        const num = String(L.whatsappNumber || '').replace(/\D/g, '');
        $('#luckyWa').href = `https://wa.me/${num}?text=${text}`;
        send.classList.remove('hidden');
        gsap.fromTo(send, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.2 });
        let nags = 0;
        $('#luckyNotSent').onclick = () => {
          const lines = Array.isArray(T.luckyNag) && T.luckyNag.length ? T.luckyNag : [''];
          const emojis = ['😤', '🙄', '😱', '😏'];
          $('#luckyNagEmoji').textContent = emojis[nags % emojis.length];
          $('#luckyNagText').textContent = fmt(lines[nags++ % lines.length]);
          const modal = $('#luckyNagModal');
          modal.classList.remove('hidden');
          gsap.fromTo('#luckyNagModal .modal-card', { scale: 0.6, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.8)' });
          if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
          $('#luckyNagOk').onclick = () => modal.classList.add('hidden');
        };
        $('#luckySent').onclick = () => {
          $('#luckySent').onclick = null;
          st.sent = true;
          saveLucky(st);
          heartBurst(0.5, 0.6, 24);
          leave();
        };
        return;
      }
      nextBtn.classList.remove('hidden');
      gsap.fromTo(nextBtn, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });
      nextBtn.onclick = () => { nextBtn.onclick = null; leave(); };
    }

    grid.onclick = e => {
      const card = e.target.closest('.l-card');
      if (!card || busy || st.picksDone >= tries) return;
      busy = true;
      grid.classList.remove('picking');
      const c = picks[st.picksDone];
      st.picksDone++;
      saveLucky(st);
      turn(card, c, [c.prize ? 'prize' : 'nothing']);
      showTries();
      if (c.prize) {
        msg.textContent = t('luckyWin').replace('{title}', fmt(c.title)).replace('{text}', fmt(c.text));
        msg.classList.add('win');
        const b = card.getBoundingClientRect();
        confetti({ particleCount: 80, spread: 70, origin: { x: (b.left + b.width / 2) / innerWidth, y: (b.top + b.height / 2) / innerHeight }, colors: COLORS });
        showTray();
      } else {
        msg.textContent = fmt(c.text);
        msg.classList.remove('win');
        gsap.fromTo(card, { x: 0 }, { keyframes: [{ x: -8 }, { x: 7 }, { x: -5 }, { x: 0 }], duration: 0.4, delay: 0.35 });
        if (navigator.vibrate) navigator.vibrate(60);
      }
      gsap.fromTo(msg, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' });
      if (st.picksDone >= tries) return setTimeout(() => finish(false), 2000);
      // Show the result for a moment, turn it back, then shuffle everything for the next pick
      setTimeout(() => { unturn(card); setTimeout(() => shuffleCards(readyToPick), 700); }, 1900);
    };

    showTries();
    showTray();
    if (st.done || st.picksDone >= tries) return finish(true);
    gsap.from(cardEls(), { y: 30, opacity: 0, scale: 0.8, stagger: 0.03, duration: 0.45, ease: 'back.out(1.7)', clearProps: 'opacity,transform',
      onComplete: () => shuffleCards(readyToPick) });
  }

  function goToCountdown() {
    stopGameMusic();
    if (!isUnlocked()) showGate(new Date(C.event.date).getTime());
    else afterUnlock();
  }

  function afterUnlock() {
    tryAutoplay().then(state => (state === 'blocked' ? showBegin() : showIntro()));
  }

  function showBegin() {
    const el = $('#begin');
    el.classList.remove('hidden');
    gsap.from('#begin > *', { y: 40, opacity: 0, stagger: 0.15, duration: 0.9, ease: 'back.out(1.6)' });
    let done = false;
    el.addEventListener('click', () => {
      if (done) return;
      done = true;
      startMusic();
      gsap.to(el, { opacity: 0, duration: 0.6, onComplete: () => { el.classList.add('hidden'); showIntro(); } });
    });
  }

  /* ---------------- Login ---------------- */
  let rainTimer = null;
  function startHeartRain() {
    const box = $('#heartRain');
    const icons = C.theme.cursorIcons;
    const drop = () => {
      if (document.hidden) return;
      const h = document.createElement('span');
      const dur = rand(5, 10);
      h.className = 'rain-heart';
      h.textContent = icons[(Math.random() * icons.length) | 0];
      h.style.left = rand(0, 100) + 'vw';
      h.style.fontSize = rand(12, 30) + 'px';
      h.style.color = COLORS[(Math.random() * 3) | 0];
      h.style.opacity = rand(0.4, 0.9);
      h.style.animationDuration = dur + 's';
      h.style.setProperty('--drift', rand(-60, 60) + 'px');
      h.style.setProperty('--spin', rand(-180, 180) + 'deg');
      box.appendChild(h);
      setTimeout(() => h.remove(), dur * 1000);
    };
    for (let i = 0; i < 8; i++) setTimeout(drop, i * 120);
    rainTimer = setInterval(drop, isTouch ? 380 : 260);
    // A first shower of hearts from the top
    confetti({
      particleCount: 45, angle: 270, spread: 180, startVelocity: 8, gravity: 0.45, ticks: 320, origin: { x: 0.5, y: -0.1 },
      scalar: heartShape ? 1.8 : 1, colors: COLORS, shapes: heartShape ? [heartShape] : undefined
    });
  }
  const stopHeartRain = () => clearInterval(rainTimer);
  const focusLogin = () => { if (!isTouch) $('.login-user').focus({ preventScroll: true }); };

  function showLogin() {
    $('#login').classList.remove('hidden');
    startHeartRain();
    const e = (C.login.entrance || 'bike').toLowerCase();
    const mode = e === 'random' ? (Math.random() < 0.5 ? 'bike' : 'arrow') : e;
    if (mode === 'arrow') arrowEntrance(); else bikeEntrance();
  }

  // A couple on a scooter drags the login card in on a rope, the rope snaps, they ride away.
  function bikeEntrance() {
    const wrap = $('#loginWrap'), card = $('#loginCard'), bike = $('#bike'), rope = $('#rope');
    // On phones the scooter rides under the card (see CSS), on bigger screens beside it
    const under = window.matchMedia('(max-width: 600px)').matches;
    const startX = -(Math.max(wrap.getBoundingClientRect().right, bike.getBoundingClientRect().right) + 60);
    bike.classList.add('riding');
    gsap.set([bike, rope], { opacity: 1 });
    gsap.set(card, under ? { rotation: -5, transformOrigin: '22% 100%' } : { rotation: 7, transformOrigin: '100% 72%' });
    const tl = gsap.timeline({ delay: 0.5, onComplete: focusLogin });
    tl.from(wrap, { x: startX, duration: 3, ease: 'power2.out' })
      .to(card, { rotation: 0, duration: 1.4, ease: 'elastic.out(1, 0.35)' }, '-=0.5')
      .to(rope, under
        ? { scaleY: 0, opacity: 0, duration: 0.3, transformOrigin: 'center bottom' }
        : { scaleX: 0, opacity: 0, duration: 0.3, transformOrigin: 'right center' }, '-=1.1')
      .add(() => {
        const b = rope.getBoundingClientRect();
        heartBurst(Math.min(b.left / innerWidth, 0.95), b.top / innerHeight, 16);
      }, '<')
      .to(bike, { x: () => innerWidth + bike.offsetWidth, duration: 1.4, ease: 'power2.in' }, '-=0.6')
      .add(() => { bike.classList.remove('riding'); gsap.set(bike, { opacity: 0 }); });
  }

  // Cupid's arrow flies in, hits, and the card pops out of the hit.
  function arrowEntrance() {
    const card = $('#loginCard'), arrow = $('#arrow');
    const a = arrow.getBoundingClientRect();
    gsap.set(card, { scale: 0, opacity: 0, transformOrigin: '50% 40%' });
    gsap.set(arrow, { opacity: 1 });
    const tl = gsap.timeline({ delay: 0.6, onComplete: focusLogin });
    tl.fromTo(arrow, { x: -(a.right + 60) }, { x: 0, duration: 0.85, ease: 'power1.in' })
      .fromTo(arrow, { y: -140, rotation: 14 }, { y: 0, rotation: 0, duration: 0.85, ease: 'sine.out' }, '<')
      .add(() => {
        const b = arrow.getBoundingClientRect();
        heartBurst((b.right - 12) / innerWidth, (b.top + b.height / 2) / innerHeight, 40);
        gsap.fromTo('#loginWrap', { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
      })
      .to(card, { scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.6)' })
      .fromTo(arrow, { rotation: -6 }, { rotation: 0, duration: 1.2, ease: 'elastic.out(1, 0.25)' }, '<');
  }

  const userIns = $$('.login-user'), passIns = $$('.login-pass'), secretIn = $('.login-secret');
  const allIns = userIns.concat(passIns, [secretIn]);
  const norm = s => (C.login.caseSensitive ? String(s).trim() : String(s).trim().toLowerCase());
  // "13/10/2002", "13-10-2002", "13.10.2002", "13102002" and "3/1/2002"-style all compare equal
  const normDate = s => {
    const parts = String(s).trim().split(/\D+/).filter(Boolean);
    return parts.length === 3 ? parts[0].padStart(2, '0') + parts[1].padStart(2, '0') + parts[2] : parts.join('');
  };
  const samePass = (typed, real) => (C.login.passwordIsDate ? normDate(typed) === normDate(real) : norm(typed) === norm(real));

  // Date fields: type only digits, the slashes appear by themselves (13102002 -> 13/10/2002)
  if (C.login.passwordIsDate) {
    passIns.forEach(i => {
      i.setAttribute('inputmode', 'numeric');
      i.maxLength = 10;
      i.addEventListener('input', () => {
        const d = i.value.replace(/\D/g, '').slice(0, 8);
        i.value = d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2, 4) : '') + (d.length > 4 ? '/' + d.slice(4) : '');
      });
    });
  }
  function loginError(msg, inputs) {
    $('#loginError').textContent = msg;
    inputs.forEach(i => i.closest('.field-box').classList.add('bad'));
    gsap.fromTo('#loginCard', { x: 0 }, { keyframes: [{ x: -14 }, { x: 12 }, { x: -8 }, { x: 6 }, { x: 0 }], duration: 0.45 });
    if (navigator.vibrate) navigator.vibrate(120);
  }
  allIns.forEach(i => i.addEventListener('input', () => {
    i.closest('.field-box').classList.remove('bad');
    $('#loginError').textContent = '';
  }));
  $('#togglePass').addEventListener('click', () => {
    const show = passIns[0].type === 'password';
    passIns.concat([secretIn]).forEach(i => { i.type = show ? 'text' : 'password'; });
    $('#togglePass').textContent = show ? '🙈' : '👁️';
  });

  let loggedIn = false;
  let checking = false;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (loggedIn || checking) return;
    const empty = allIns.filter(i => !i.value.trim());
    if (empty.length) return loginError(t('loginEmpty'), empty);
    const btn = $('#loginBtn');
    checking = true;
    btn.disabled = true;
    btn.textContent = t('loginChecking');
    try {
      await unlockContent(keyMaterial(userIns.map(i => i.value), passIns.map(i => i.value), secretIn.value));
    } catch (err) {
      checking = false;
      btn.disabled = false;
      btn.textContent = t('loginBtn');
      // A wrong answer can't decrypt (OperationError); anything else is a loading problem
      return loginError(err && err.name === 'OperationError' ? t('loginError') : t('loginNetError'), err && err.name === 'OperationError' ? allIns : []);
    }
    try {
      await prepareMedia((d, n) => { btn.textContent = t('loginOpening').replace('{n}', d).replace('{total}', n); });
    } catch (err) {
      checking = false;
      btn.disabled = false;
      btn.textContent = t('loginBtn');
      return loginError(t('loginNetError'), []);
    }
    btn.disabled = false;
    loggedIn = true;
    if (C.login.rememberOnDevice) store.set(KEY_LOGIN, String(Date.now()));
    startGameMusic();
    if (document.activeElement) document.activeElement.blur();
    $('#loginLock').textContent = '💖';
    gsap.fromTo('#loginLock', { scale: 0.4, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    $('#loginBtn').textContent = t('loginSuccess');
    burst();
    heartBurst(0.5, 0.45, 50);
    setTimeout(() => {
      gsap.to('#loginCard', { scale: 1.12, opacity: 0, duration: 0.7, ease: 'power2.in' });
      gsap.to('#login', {
        opacity: 0, duration: 0.8, delay: 0.4,
        onComplete: () => { $('#login').classList.add('hidden'); stopHeartRain(); afterLogin(); }
      });
    }, 1400);
  });

  /* ---------------- Intro gift ---------------- */
  function showIntro() {
    const intro = $('#intro');
    intro.classList.remove('hidden');
    if (store.get(KEY_OPENED)) {
      $('.intro-title').dataset.t = 'welcomeTitle';
      $('.intro-sub').dataset.t = 'welcomeSub';
      $('#openGift').dataset.t = 'welcomeBtn';
      applyTexts(intro);
    }
    gsap.from('#intro > *', { y: 50, opacity: 0, stagger: 0.18, duration: 1, ease: 'back.out(1.6)' });
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      store.set(KEY_OPENED, String(Date.now()));
      $('#gift').classList.add('open');
      startMusic();
      setTimeout(() => { burst(); sideCannons(2200); }, 450);
      gsap.to('#intro h2, #intro p, #openGift', { opacity: 0, y: 30, duration: 0.5 });
      setTimeout(() => {
        gsap.to(intro, { opacity: 0, duration: 0.8, onComplete: () => intro.classList.add('hidden') });
        revealMain();
      }, 1500);
    };
    $('#openGift').addEventListener('click', open);
    $('#gift').addEventListener('click', open);
  }

  /* ---------------- Main reveal ---------------- */
  function splitLetters(el) {
    const text = el.textContent;
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const o = document.createElement('span');
      o.className = 'ch';
      const inner = document.createElement('span');
      inner.style.setProperty('--i', i);
      inner.textContent = ch === ' ' ? ' ' : ch;
      o.appendChild(inner);
      el.appendChild(o);
    });
    return $$('.ch', el);
  }

  function revealMain() {
    fillContent();
    $('#main').classList.remove('hidden');
    document.body.classList.remove('locked');
    window.scrollTo(0, 0);
    $$('.scratch-card').forEach(initScratch);

    try { cake = window.Scenes.initCake($('#cake3d')); } catch (e) { console.warn('WebGL cake failed', e); }

    const chars = splitLetters($('#hb'));
    const tl = gsap.timeline();
    tl.from('#heroDate', { y: 20, opacity: 0, duration: 0.6 })
      .from(chars, { y: 90, opacity: 0, rotateX: -90, stagger: 0.05, duration: 0.9, ease: 'back.out(1.8)' }, '-=0.2')
      .from('#heroName', { scale: 0.4, opacity: 0, duration: 1.4, ease: 'elastic.out(1, 0.55)' }, '-=0.4')
      .from('#cake3d', { y: 120, opacity: 0, duration: 1.2, ease: 'power3.out' }, '-=1.1')
      .from('.hero-actions .btn', { y: 30, opacity: 0, stagger: 0.12, duration: 0.6 }, '-=0.5')
      .from('.scroll-hint', { opacity: 0, duration: 0.6 });

    initCarousel();
    initScrollAnims();
    initTogether();
    initFireworks();
  }

  /* ---------------- Candles ---------------- */
  const blowBtn = $('#blowBtn');
  const micBtn = $('#micBtn');
  function doBlow() {
    if (!cake || !cake.isLit()) return;
    cake.blow(() => {
      burst();
      sideCannons(3000);
      setTimeout(() => heartBurst(0.5, 0.4, 40), 600);
      const msg = $('#wishMsg');
      msg.textContent = t('wishMessage');
      gsap.fromTo(msg, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(2)' });
      blowBtn.textContent = t('relightBtn');
      if (micBtn) micBtn.classList.add('hidden');
    });
  }
  blowBtn.addEventListener('click', () => {
    if (!cake) return;
    if (cake.isLit()) doBlow();
    else {
      cake.relight();
      blowBtn.textContent = t('blowBtn');
      if (micBtn) {
        micBtn.classList.remove('hidden');
        micBtn.textContent = t('micBtn');
      }
      $('#wishMsg').textContent = '';
    }
  });

  if (micBtn) micBtn.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      micBtn.textContent = t('micNotSupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      micBtn.textContent = t('micListening');
      let hits = 0;
      const stop = () => { stream.getTracks().forEach(t => t.stop()); ctx.close(); };
      (function listen() {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / data.length);
        hits = rms > S.micSensitivity ? hits + 1 : Math.max(0, hits - 1);
        if (hits > 8) { stop(); doBlow(); return; }
        if (!cake || !cake.isLit()) { stop(); return; }
        requestAnimationFrame(listen);
      })();
    } catch (e) {
      micBtn.textContent = t('micDenied');
    }
  });

  /* ---------------- Together counter ---------------- */
  function initTogether() {
    if (!$('#together') || !C.event.togetherSince) return;
    const start = new Date(C.event.togetherSince).getTime();
    const upd = () => {
      const diff = Math.max(0, Date.now() - start);
      $('#tD').textContent = Math.floor(diff / 864e5).toLocaleString(C.event.locale);
      $('#tH').textContent = pad(Math.floor(diff / 36e5) % 24);
      $('#tM').textContent = pad(Math.floor(diff / 6e4) % 60);
      $('#tS').textContent = pad(Math.floor(diff / 1e3) % 60);
    };
    upd();
    setInterval(upd, 1000);
  }

  /* ---------------- 3D carousel ---------------- */
  function initCarousel() {
    const stage = $('#stage');
    const ring = $('#ring');
    if (!stage) return;
    const photos = (C.carouselPhotos || C.photos).slice(0, S.carouselMaxPhotos);
    const n = photos.length;
    if (!n) return;
    photos.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'card3d';
      d.dataset.index = i;
      // A video card shows a silent looping preview; it plays with sound when opened
      d.innerHTML = p.video
        ? `<video muted loop playsinline autoplay preload="metadata"></video><span class="card-play">▶</span>`
        : `<img src="${esc(p.src)}" alt="">`;
      ring.appendChild(d);
      if (p.video) getMedia(p.video).then(url => { const v = $('video', d); v.src = url; v.play().catch(() => {}); });
    });
    const cards = $$('.card3d', ring);
    let radius = 0;
    function layout() {
      const w = ring.offsetWidth;
      radius = Math.round((w / 2) / Math.tan(Math.PI / Math.max(n, 3))) + (n < 6 ? 120 : 40);
      cards.forEach((c, i) => { c.style.transform = `rotateY(${(i * 360) / n}deg) translateZ(${radius}px)`; });
    }
    layout();
    window.addEventListener('resize', layout);

    let angle = 0, vel = S.carouselSpeed, dragging = false, lastX = 0, moved = 0, visible = false;
    stage.addEventListener('pointerdown', e => {
      dragging = true; moved = 0; lastX = e.clientX;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      angle += dx * 0.25;
      vel = dx * 0.25;
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      if (moved < 6) {
        // Browsers mis-detect taps on spinning 3D cards, so work out which front-facing card is under the finger
        const st = stage.getBoundingClientRect();
        const dx = e.clientX - (st.left + st.width / 2);
        const P = parseFloat(getComputedStyle(stage).perspective) || 1400;
        const half = ring.offsetWidth / 2;
        let best = -1, bestDist = Infinity;
        for (let i = 0; i < n; i++) {
          const a = (i * 360 / n + angle) * Math.PI / 180;
          if (Math.cos(a) < 0.25) continue;                       // card is turned away
          const z = radius * Math.cos(a) - radius;
          const x = radius * Math.sin(a) * P / (P - z);           // where its centre appears on screen
          const dist = Math.abs(x - dx);
          if (dist < bestDist) { bestDist = dist; best = i; }
        }
        if (best >= 0 && bestDist < half * 1.2) openLightbox(best, photos);
      }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', () => { dragging = false; });

    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(stage);
    (function loop() {
      requestAnimationFrame(loop);
      if (!visible) return;
      if (!dragging) {
        vel += (S.carouselSpeed - vel) * 0.02;
        angle += vel;
      }
      ring.style.transform = `translateZ(${-radius}px) rotateX(-8deg) rotateY(${angle}deg)`;
    })();
  }

  /* ---------------- Lightbox ---------------- */
  const lb = $('#lightbox');
  let lbIndex = 0;
  let lbList = [];
  function openLightbox(i, list) {
    if (list) lbList = list;
    const n = lbList.length;
    lbIndex = (i + n) % n;
    const p = lbList[lbIndex];
    const v = $('#lbVideo'), img = $('#lbImg');
    v.pause();
    if (p.video) {
      img.classList.add('hidden');
      v.classList.remove('hidden');
      lbPauseMusic();
      getMedia(p.video).then(url => {
        if (lbList[lbIndex] !== p || lb.classList.contains('hidden')) return;   // she moved on meanwhile
        v.src = url;
        v.muted = false;
        v.currentTime = 0;
        v.play().catch(() => {});
      });
    } else {
      v.classList.add('hidden');
      v.removeAttribute('src');
      v.load();
      lbResumeMusic();
      img.classList.remove('hidden');
      img.src = p.src;
    }
    $('#lbCap').textContent = p.caption || '';
    lb.classList.remove('hidden');
    gsap.fromTo('#lightbox figure', { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' });
  }
  // Site music pauses while a lightbox video plays, and comes back afterwards
  let lbMusicWas = false;
  function lbPauseMusic() {
    if (!audio.paused) { lbMusicWas = true; audio.pause(); musicBtn.classList.remove('playing'); }
  }
  function lbResumeMusic() {
    if (lbMusicWas) { lbMusicWas = false; audio.play().catch(() => {}); musicBtn.classList.add('playing'); }
  }
  const closeLightbox = () => {
    const v = $('#lbVideo');
    v.pause();
    v.removeAttribute('src');
    v.load();
    lb.classList.add('hidden');
    lbResumeMusic();
  };
  $('#lightbox .lb-close').addEventListener('click', closeLightbox);
  $('#lightbox .lb-prev').addEventListener('click', e => { e.stopPropagation(); openLightbox(lbIndex - 1); });
  $('#lightbox .lb-next').addEventListener('click', e => { e.stopPropagation(); openLightbox(lbIndex + 1); });
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  window.addEventListener('keydown', e => {
    if (lb.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
    if (e.key === 'ArrowRight') openLightbox(lbIndex + 1);
  });
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) openLightbox(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------------- Scroll animations ---------------- */
  function initScrollAnims() {
    $$('.section-title').forEach(el => {
      gsap.from(el, { y: 70, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
    });
    $$('.section-sub').forEach(el => {
      gsap.from(el, { y: 20, opacity: 0, duration: 0.8, delay: 0.2, scrollTrigger: { trigger: el, start: 'top 90%' } });
    });

    if ($('.counter')) gsap.from('.ct-box', {
      y: 60, opacity: 0, rotateX: -60, stagger: 0.12, duration: 0.9, ease: 'back.out(1.6)',
      scrollTrigger: { trigger: '.counter', start: 'top 85%' }
    });

    if ($('.stage')) gsap.from('.stage', { scale: 0.7, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.stage', start: 'top 85%' } });

    if ($('#tlProgress')) gsap.to('#tlProgress', {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: '#timeline', start: 'top 70%', end: 'bottom 70%', scrub: true }
    });
    $$('.tl-item').forEach(item => {
      const fromLeft = item.classList.contains('left') && innerWidth > 760;
      gsap.from(item.querySelector('.tl-card'), {
        x: fromLeft ? -100 : 100, opacity: 0, rotateY: fromLeft ? 15 : -15, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: item, start: 'top 82%' }
      });
      gsap.from(item.querySelector('.tl-dot'), {
        scale: 0, duration: 0.6, ease: 'back.out(3)', scrollTrigger: { trigger: item, start: 'top 75%' }
      });
    });

    $$('.polaroid').forEach((el, i) => {
      const r = rand(-7, 7);
      gsap.set(el, { rotation: r });
      gsap.from(el, {
        y: 100, opacity: 0, scale: 0.8, duration: 0.9, ease: 'back.out(1.4)', delay: (i % 4) * 0.08,
        scrollTrigger: { trigger: el, start: 'top 94%' }
      });
      el.addEventListener('mouseenter', () => gsap.to(el, { rotation: 0, scale: 1.06, y: -10, duration: 0.35, zIndex: 5 }));
      el.addEventListener('mouseleave', () => gsap.to(el, { rotation: r, scale: 1, y: 0, duration: 0.5, zIndex: 1 }));
      el.addEventListener('click', () => openLightbox(+el.dataset.index, C.photos));
    });

    if ($('#reasonsGrid')) gsap.from('.flip', {
      y: 80, opacity: 0, rotateY: -40, stagger: 0.1, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: '#reasonsGrid', start: 'top 85%' }
    });

    if ($('#envelope')) gsap.from('#envelope', {
      y: 80, opacity: 0, rotate: -8, duration: 1, ease: 'back.out(1.5)',
      scrollTrigger: { trigger: '#envelope', start: 'top 88%' }
    });

    if ($('#finale')) gsap.from('.finale-content > *', {
      y: 60, opacity: 0, stagger: 0.2, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#finale', start: 'top 60%' }
    });

    // Hero gently fades & lifts as you scroll away
    gsap.to('.hero-text', {
      y: -80, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    ScrollTrigger.refresh();
    // Images can change layout height once loaded
    $$('img').forEach(img => { if (!img.complete) img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true }); });
  }

  /* ---------------- Letter ---------------- */
  const envelope = $('#envelope');
  if (envelope) envelope.addEventListener('click', () => {
    if (envelope.classList.contains('open')) return;
    envelope.classList.add('open');
    const b = envelope.getBoundingClientRect();
    heartBurst((b.left + b.width / 2) / innerWidth, (b.top + b.height / 2) / innerHeight, 30);
    setTimeout(() => {
      gsap.to(['#envelope', '#letterHint'], {
        opacity: 0, scale: 0.8, duration: 0.6, onComplete: () => {
          envelope.classList.add('hidden');
          $('#letterHint').classList.add('hidden');
          const card = $('#letterCard');
          card.classList.remove('hidden');
          gsap.fromTo(card, { y: 80, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.4)' });
          typeWriter($('#letterText'), fmt(C.letter), () => $('.letter-sign').classList.add('show'));
          ScrollTrigger.refresh();
        }
      });
    }, 1700);
  });

  function typeWriter(el, text, done) {
    const chars = [...text];
    let i = 0;
    const caret = document.createElement('span');
    caret.className = 'caret';
    const node = document.createTextNode('');
    el.append(node, caret);
    (function step() {
      if (i >= chars.length) { caret.remove(); if (done) done(); return; }
      node.data += chars[i];
      const ch = chars[i++];
      const delay = ch === '\n' ? S.typingSpeed * 6 : /[.,!?]/.test(ch) ? S.typingSpeed * 5 : S.typingSpeed;
      setTimeout(step, delay);
    })();
  }

  /* ---------------- Fireworks ---------------- */
  function initFireworks() {
    const canvas = $('#fireworks');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, running = false;
    const rockets = [], parts = [];
    const dpr = Math.min(window.devicePixelRatio, 2);

    function resize() {
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function launch(x) {
      const g = 0.12;
      const height = h * rand(0.45, 0.75);
      rockets.push({ x: x != null ? x : rand(w * 0.15, w * 0.85), y: h, vx: rand(-1, 1), vy: -Math.sqrt(2 * g * height), g, hue: rand(0, 360) });
    }
    function explode(r) {
      const heart = Math.random() < 0.35;
      const count = heart ? 90 : 110;
      const hue = Math.random() < 0.5 ? rand(320, 360) : rand(0, 360);
      for (let i = 0; i < count; i++) {
        let vx, vy;
        if (heart) {
          const t = (i / count) * Math.PI * 2;
          const s = rand(0.22, 0.26);
          vx = 16 * Math.pow(Math.sin(t), 3) * s;
          vy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s;
        } else {
          const a = Math.random() * Math.PI * 2, sp = rand(1, 5.5);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        }
        parts.push({ x: r.x, y: r.y, vx, vy, life: 1, decay: rand(0.008, 0.016), hue: hue + rand(-15, 15), size: rand(1.5, 2.8) });
      }
    }

    let lastLaunch = 0;
    function frame(ts) {
      if (!running) return;
      requestAnimationFrame(frame);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      if (ts - lastLaunch > rand(500, 1100)) { launch(); lastLaunch = ts; }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx; r.y += r.vy; r.vy += r.g;
        ctx.fillStyle = `hsl(${r.hue},100%,75%)`;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2); ctx.fill();
        if (r.vy >= -0.4) { explode(r); rockets.splice(i, 1); }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= 0.98; p.vy = p.vy * 0.98 + 0.045;
        p.x += p.vx; p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.fillStyle = `hsla(${p.hue},100%,65%,${p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }

    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !running) {
        running = true;
        resize();
        requestAnimationFrame(frame);
      } else if (!en.isIntersecting) {
        running = false;
      }
    }, { threshold: 0.2 }).observe($('#finale'));

    $('#finale').addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const b = canvas.getBoundingClientRect();
      launch(e.clientX - b.left);
    });
  }

  if ($('#replayBtn')) $('#replayBtn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (cake && !cake.isLit()) blowBtn.click();
    setTimeout(burst, 700);
  });

  /* ---------------- Scratch gift cards ---------------- */
  function initScratch(card) {
    const cv = $('canvas', card);
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, done = false, drawing = false, last = null, moves = 0;

    function paint() {
      if (done) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = card.clientWidth; h = card.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, w, h);
      const cover = C.theme.scratchCover;
      cover.forEach((c, i) => g.addColorStop(i / Math.max(cover.length - 1, 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${rand(0.15, 0.6)})`;
        ctx.beginPath(); ctx.arc(rand(0, w), rand(0, h), rand(0.6, 2.2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = C.theme.scratchText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '40px sans-serif';
      ctx.fillText('🎁', w / 2, h / 2 - 22);
      ctx.font = '600 19px Poppins, sans-serif';
      ctx.fillText(t('scratchLabel'), w / 2, h / 2 + 24);
    }

    const point = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function scratch(p) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo((last || p).x, (last || p).y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      if (++moves % 8 === 0) checkCleared();
    }
    function checkCleared() {
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0, total = 0;
      for (let i = 3; i < data.length; i += 4 * 24) { total++; if (data[i] < 40) clear++; }
      if (clear / total > S.scratchRevealPercent / 100) reveal();
    }
    function reveal() {
      if (done) return;
      done = true;
      gsap.to(cv, { opacity: 0, duration: 0.5, onComplete: () => cv.remove() });
      card.classList.add('revealed');
      const b = card.getBoundingClientRect();
      heartBurst((b.left + b.width / 2) / innerWidth, (b.top + b.height / 2) / innerHeight, 24);
    }

    cv.addEventListener('pointerdown', e => { e.preventDefault(); drawing = true; last = null; cv.setPointerCapture(e.pointerId); scratch(point(e)); });
    cv.addEventListener('pointermove', e => { if (drawing) scratch(point(e)); });
    const stop = () => { drawing = false; last = null; if (!done) checkCleared(); };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);

    paint();
    // Repaint once the Poppins font is ready so the label uses it
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!moves) paint(); });
    window.addEventListener('resize', () => { if (!moves) paint(); });
  }

  /* ---------------- Midnight surprise: calendar alarm + push ---------------- */
  const siteLink = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = s => String(s).replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
  function icsFold(line) {
    const chars = Array.from(line);
    const out = [];
    for (let i = 0; i < chars.length; i += 60) out.push((i ? ' ' : '') + chars.slice(i, i + 60).join(''));
    return out.join('\r\n');
  }
  function eventTimes() {
    const start = new Date(C.event.date);
    return { start, end: new Date(start.getTime() + S.calendarDurationMinutes * 60000) };
  }

  function downloadICS() {
    const { start, end } = eventTimes();
    const link = siteLink();
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Birthday Surprise//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:bday-surprise-${icsDate(start)}@birthday`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(t('calendarTitle'))}`,
      `DESCRIPTION:${icsText(t('calendarText') + '\n' + link)}`,
      `URL:${link}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(t('calendarTitle'))}`, 'TRIGGER:-PT0M', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:AUDIO', 'TRIGGER:-PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'birthday-surprise.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    $('#icsBtn').classList.add('done');
    markSurpriseEnabled();
  }

  function googleCalendarUrl() {
    const { start, end } = eventTimes();
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: t('calendarTitle'),
      dates: `${icsDate(start)}/${icsDate(end)}`,
      details: `${t('calendarText')}\n${siteLink()}`
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  function showSurpriseEnabled() {
    const btn = $('#enableSurprise');
    btn.textContent = t('surpriseEnabledBtn');
    btn.classList.add('enabled');
    $('#surpriseStatus').textContent = t('surpriseEnabledStatus');
  }
  function markSurpriseEnabled() {
    store.set(KEY_SURPRISE, String(Date.now()));
    showSurpriseEnabled();
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, colors: COLORS });
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function initOneSignal() {
    if (!C.oneSignalAppId || location.protocol === 'file:') return;
    $('#pushBtn').classList.remove('hidden');
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const base = location.pathname.replace(/[^/]*$/, '');
    window.OneSignalDeferred.push(async OneSignal => {
      await OneSignal.init({
        appId: C.oneSignalAppId,
        serviceWorkerPath: base.slice(1) + 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: base },
        allowLocalhostAsSecureOrigin: true
      });
    });
    const s = document.createElement('script');
    s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  const modal = $('#surpriseModal');
  $('#enableSurprise').addEventListener('click', () => {
    $('#gcalBtn').href = googleCalendarUrl();
    modal.classList.remove('hidden');
    gsap.fromTo('.modal-card', { y: 40, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
  });
  $('.modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  $('#icsBtn').addEventListener('click', downloadICS);
  $('#gcalBtn').addEventListener('click', () => { $('#gcalBtn').classList.add('done'); markSurpriseEnabled(); });
  $('#pushBtn').addEventListener('click', () => {
    if (isIOS && !isStandalone) { $('#iosHint').classList.remove('hidden'); return; }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async OneSignal => {
      await OneSignal.Notifications.requestPermission();
      if (OneSignal.Notifications.permission) {
        $('#pushBtn').classList.add('done');
        markSurpriseEnabled();
      } else {
        $('#surpriseStatus').textContent = t('surprisePushBlocked');
      }
    });
  });

  /* ---------------- Cursor hearts ---------------- */
  const trailIcons = C.theme.cursorIcons;
  function spawnHeart(x, y, size) {
    const s = document.createElement('span');
    s.className = 'trail-heart';
    s.textContent = trailIcons[(Math.random() * trailIcons.length) | 0];
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.fontSize = (size || rand(12, 22)) + 'px';
    s.style.color = COLORS[(Math.random() * 3) | 0];
    s.style.setProperty('--dx', rand(-40, 40) + 'px');
    s.style.setProperty('--rot', rand(-60, 60) + 'deg');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
  if (!isTouch) {
    let last = 0;
    window.addEventListener('mousemove', e => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      spawnHeart(e.clientX, e.clientY);
    }, { passive: true });
  }
  window.addEventListener('pointerdown', e => {
    for (let i = 0; i < 5; i++) spawnHeart(e.clientX + rand(-10, 10), e.clientY + rand(-10, 10), rand(14, 26));
  });

  /* ---------------- Boot ---------------- */
  fillBasics();
  initOneSignal();
  try { window.Scenes.initBackground($('#bg3d')); } catch (e) { console.warn('WebGL background failed', e); }

  const timeReady = syncTime();
  window.addEventListener('load', async () => {
    await timeReady;
    setTimeout(() => {
      $('#loader').classList.add('done');
      startFlow();
    }, 700);
  });
})();
