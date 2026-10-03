(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const STORE = 'giveaway-wheel-v2';
  const src = Meta.source;

  // Normalise a name for comparing: no "@", no extra spaces, lower case.
  const key = s => String(s || '').replace(/[​-‏﻿]/g, '').trim().replace(/^@/, '').replace(/\s+/g, ' ').toLowerCase();
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { instagram: '📸', facebook: '👍' };
  const SITE = { instagram: 'Instagram', facebook: 'Facebook' };

  // ---------- State (saved in this browser so a refresh doesn't lose anything) ----------
  const defaults = () => ({
    selected: [],   // posts chosen for the giveaway
    comments: {},   // post.key → [{authorId, author, text, time}]
    ownIds: [],     // her own accounts, never entered
    deadline: '',
    exclude: '',
    manual: '',
    perPost: false,
    unchecked: [],  // person keys she unticked
    winners: [],    // {name, personKey, at, removed}
  });
  let state = Object.assign(defaults(), load(src && src.demo ? STORE + '-demo' : STORE));

  function load(k) {
    try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(src && src.demo ? STORE + '-demo' : STORE, JSON.stringify(state)); } catch { /* private mode */ }
  }

  // ---------- Step 1: login ----------
  let recent = [];          // her recent posts from all connected accounts
  let recentLimit = 60;

  function show(id, on) { $(id).hidden = !on; }

  async function start() {
    if (src && src.demo) show('#demoBanner', true);
    if (!src) {
      show('#setupNeeded', true);
      renderSelected();
      return;
    }
    try {
      const ok = await src.init();
      ok ? await afterLogin() : showLoggedOut();
    } catch (e) {
      showLoggedOut();
      loginError(e.message);
    }
  }

  function showLoggedOut() {
    show('#loggedOut', true);
    show('#loggedIn', false);
    renderSelected();
    renderPicker();
  }

  function loginError(msg) {
    $('#loginError').textContent = msg || '';
    show('#loginError', !!msg);
  }

  $('#login').addEventListener('click', async () => {
    loginError('');
    $('#login').disabled = true;
    try {
      await src.login();
      await afterLogin();
    } catch (e) {
      loginError(e.message);
    } finally {
      $('#login').disabled = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await src.logout();
    recent = [];
    showLoggedOut();
  });

  async function afterLogin() {
    const accts = src.accounts();
    show('#loggedOut', false);
    show('#loggedIn', true);
    state.ownIds = [...new Set([...state.ownIds, ...accts.map(a => (a.platform === 'instagram' ? a.username.toLowerCase() : a.id))])];
    save();

    const box = $('#accounts');
    if (!accts.length) {
      box.innerHTML = '<p class="error">You’re logged in, but no Facebook Page was found. Log out and log in again, and make sure your Page (and Instagram) are ticked when Facebook asks.</p>';
    } else {
      box.innerHTML = '<p>✅ Connected:</p>' + accts.map(a => `<span class="acct ${a.platform}">${ICON[a.platform]} ${escapeHtml(a.name)}</span>`).join('');
      if (!accts.some(a => a.platform === 'instagram')) {
        box.innerHTML += '<p class="hint">No Instagram found. Instagram only works if it’s a <strong>Professional</strong> (Business or Creator) account connected to your Facebook Page.</p>';
      }
    }
    await loadRecent();
    renderSelected();
    // Refresh comments on posts chosen in an earlier visit.
    refreshAll();
  }

  async function loadRecent() {
    const lists = await Promise.all(src.accounts().map(a => src.recentPosts(a, recentLimit).catch(() => [])));
    recent = lists.flat().sort((a, b) => new Date(b.time) - new Date(a.time));
    renderPicker();
  }

  // ---------- Step 2: choose posts ----------
  const linkEl = $('#link');
  const linkMsg = msg => { $('#linkMsg').innerHTML = msg || ''; };

  $('#addLink').addEventListener('click', addFromLink);
  linkEl.addEventListener('keydown', e => { if (e.key === 'Enter') addFromLink(); });

  async function addFromLink() {
    const url = linkEl.value.trim();
    if (!url) return;
    const platform = Meta.platformOf(url);
    if (!platform) return linkMsg('That doesn’t look like an Instagram or Facebook link.');
    if (!src || !src.accounts().length) return linkMsg('Log in first (step 1).');
    if (!src.accounts().some(a => a.platform === platform)) {
      return linkMsg(platform === 'instagram'
        ? 'No Instagram account is connected. See the note in step 1.'
        : 'No Facebook Page is connected.');
    }
    if (/\/share\//.test(url)) {
      return linkMsg('That’s a “share” link. Open it, then copy the link from your browser’s address bar instead. Or pick the post from the list below.');
    }
    linkMsg('Looking for that post…');
    let post = Meta.matchLink(url, recent);
    if (!post && recentLimit < 300) {
      recentLimit = 300; // look further back
      await loadRecent();
      post = Meta.matchLink(url, recent);
    }
    if (!post) {
      $('#pickerBox').open = true;
      return linkMsg('Couldn’t find that post on your account. Pick it from your recent posts below instead.');
    }
    linkEl.value = '';
    linkMsg('');
    addPost(post);
  }

  function addPost(post) {
    if (state.selected.some(p => p.key === post.key)) return;
    state.selected.push(post);
    save();
    renderSelected();
    renderPicker();
    fetchComments(post);
  }

  function removePost(post) {
    state.selected = state.selected.filter(p => p.key !== post.key);
    delete state.comments[post.key];
    renderSelected();
    renderPicker();
    recompute();
  }

  const loading = new Set();
  const errors = {};

  async function fetchComments(post) {
    if (!src || !src.accounts().length) return;
    loading.add(post.key);
    delete errors[post.key];
    renderSelected();
    try {
      state.comments[post.key] = await src.comments(post);
    } catch (e) {
      errors[post.key] = e.message;
    }
    loading.delete(post.key);
    renderSelected();
    recompute();
  }

  function refreshAll() {
    state.selected.forEach(fetchComments);
  }

  function inTime(c) {
    return !state.deadline || !c.time || new Date(c.time) < new Date(state.deadline);
  }

  function renderSelected() {
    const box = $('#selected');
    box.innerHTML = '';
    if (!state.selected.length) {
      box.innerHTML = '<p class="hint">No posts chosen yet.</p>';
      return;
    }
    for (const post of state.selected) {
      const list = state.comments[post.key] || [];
      const others = list.filter(c => !state.ownIds.includes(c.authorId));
      const counted = others.filter(c => c.author && inTime(c));
      const hidden = others.filter(c => !c.author).length;
      const late = others.filter(c => c.author && !inTime(c)).length;
      const people = new Set(counted.map(c => c.authorId)).size;

      let status;
      if (loading.has(post.key)) status = '⏳ Getting comments…';
      else if (errors[post.key]) status = `<span class="error">⚠️ ${escapeHtml(errors[post.key])}</span>`;
      else if (!state.comments[post.key]) status = 'Log in to get the comments.';
      else {
        status = `💬 <b>${counted.length}</b> comments from <b>${people}</b> ${people === 1 ? 'person' : 'people'}`;
        if (late) status += ` · ${late} after the deadline`;
        if (hidden) status += ` · ${hidden} hidden by Facebook privacy`;
      }

      const el = document.createElement('div');
      el.className = 'sel';
      el.innerHTML = `
        ${post.thumb ? `<img src="${escapeHtml(post.thumb)}" alt="">` : '<div class="noimg">' + ICON[post.platform] + '</div>'}
        <div class="sel-body">
          <div class="sel-title">${ICON[post.platform]} ${SITE[post.platform]} · ${new Date(post.time).toLocaleDateString()}
            <a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">open ↗</a></div>
          <div class="sel-caption">${escapeHtml(post.caption.slice(0, 120)) || '<em>No caption</em>'}</div>
          <div class="sel-status">${status}</div>
        </div>
        <div class="sel-actions">
          <button class="btn link refresh" title="Get the newest comments">↻ Refresh</button>
          <button class="btn link remove" title="Remove this post">✕ Remove</button>
        </div>`;
      $('.refresh', el).addEventListener('click', () => fetchComments(post));
      $('.remove', el).addEventListener('click', () => removePost(post));
      box.appendChild(el);
    }
  }

  function renderPicker() {
    const box = $('#picker');
    box.innerHTML = '';
    show('#pickerBox', recent.length > 0);
    for (const post of recent) {
      const chosen = state.selected.some(p => p.key === post.key);
      const b = document.createElement('button');
      b.className = 'pick' + (chosen ? ' chosen' : '');
      b.innerHTML = `
        ${post.thumb ? `<img src="${escapeHtml(post.thumb)}" alt="">` : '<div class="noimg">' + ICON[post.platform] + '</div>'}
        <span class="pick-meta">${ICON[post.platform]} ${new Date(post.time).toLocaleDateString()}${chosen ? ' · ✅ added' : ''}</span>
        <span class="pick-caption">${escapeHtml(post.caption.slice(0, 70)) || '<em>No caption</em>'}</span>`;
      b.addEventListener('click', () => (chosen ? removePost(post) : addPost(post)));
      box.appendChild(b);
    }
  }

  const deadlineEl = $('#deadline');
  deadlineEl.value = state.deadline;
  deadlineEl.addEventListener('change', () => { state.deadline = deadlineEl.value; renderSelected(); recompute(); });

  // ---------- Step 3: entrants ----------
  const excludeEl = $('#exclude'), manualEl = $('#manual'), perPostEl = $('#perPost');
  excludeEl.value = state.exclude;
  manualEl.value = state.manual;
  perPostEl.checked = state.perPost;
  excludeEl.addEventListener('input', () => { state.exclude = excludeEl.value; recompute(); });
  manualEl.addEventListener('input', () => { state.manual = manualEl.value; recompute(); });
  perPostEl.addEventListener('change', () => { state.perPost = perPostEl.checked; recompute(); });

  let people = [];   // [{key, name, platform, posts:[postKey], comments, manual, active}]
  let entries = [];  // names on the wheel (with repeats when perPost)

  function recompute() {
    const excluded = new Set(state.exclude.split(',').map(key).filter(Boolean));
    const own = new Set(state.ownIds);
    const removed = new Set(state.winners.filter(w => w.removed).map(w => w.personKey));
    const map = new Map();

    for (const post of state.selected) {
      for (const c of state.comments[post.key] || []) {
        if (!c.author || !c.authorId || own.has(c.authorId) || !inTime(c)) continue;
        if (excluded.has(key(c.author))) continue;
        const k = post.platform + ':' + c.authorId;
        if (!map.has(k)) map.set(k, { key: k, name: c.author, platform: post.platform, posts: [], comments: 0, manual: false });
        const p = map.get(k);
        p.comments++;
        if (!p.posts.includes(post.key)) p.posts.push(post.key);
      }
    }
    for (const line of state.manual.split(/\r?\n/)) {
      const name = line.trim();
      const k = 'manual:' + key(name);
      if (name && !excluded.has(key(name)) && !map.has(k)) map.set(k, { key: k, name, platform: null, posts: [], comments: 0, manual: true });
    }

    people = [...map.values()].sort((a, b) => key(a.name).localeCompare(key(b.name)));
    const unchecked = new Set(state.unchecked);
    entries = [];
    for (const p of people) {
      p.won = removed.has(p.key);
      p.active = !unchecked.has(p.key) && !p.won;
      if (!p.active) continue;
      const n = state.perPost ? Math.max(1, p.posts.length) : 1;
      for (let j = 0; j < n; j++) entries.push(p);
    }

    renderEntrants();
    save();
    drawWheel();
  }

  function renderEntrants() {
    const box = $('#entrants');
    box.innerHTML = '';
    const active = people.filter(p => p.active).length;
    $('#summary').innerHTML = people.length
      ? `<b>${active}</b> ${active === 1 ? 'person' : 'people'} on the wheel` +
        (entries.length !== active ? ` (<b>${entries.length}</b> spots)` : '') +
        '. Untick anyone who shouldn’t be in it.'
      : 'Nobody yet. Choose a post in step 2 and everyone who commented will show up here.';

    for (const p of people) {
      const label = document.createElement('label');
      label.className = 'entrant' + (p.active ? '' : ' off');
      label.title = p.comments ? `${p.comments} comment${p.comments === 1 ? '' : 's'}` : '';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.active;
      cb.disabled = p.won;
      cb.addEventListener('change', () => {
        const set = new Set(state.unchecked);
        cb.checked ? set.delete(p.key) : set.add(p.key);
        state.unchecked = [...set];
        recompute();
      });
      const span = document.createElement('span');
      span.textContent = (p.platform ? ICON[p.platform] + ' ' : '') + p.name;
      label.append(cb, span);
      if (p.won) label.append(tag('🏆 won'));
      else if (p.manual) label.append(tag('added'));
      else if (state.perPost && p.posts.length > 1) label.append(tag(`×${p.posts.length}`));
      box.appendChild(label);
    }
  }

  function tag(text) {
    const t = document.createElement('em');
    t.className = 'tag';
    t.textContent = text;
    return t;
  }

  // ---------- Wheel ----------
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];
  let rotation = 0;
  let spinning = false;

  function segColor(i, n) {
    let c = i % COLORS.length;
    if (i === n - 1 && n > 1 && c === 0) c = 3; // keep last slice a different colour from the first
    return COLORS[c];
  }

  function drawWheel() {
    const W = canvas.width, R = W / 2 - 8, cx = W / 2, cy = W / 2;
    ctx.clearRect(0, 0, W, W);
    const n = entries.length;

    if (!n) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = '#f1e9ff';
      ctx.fill();
      ctx.fillStyle = '#8a7ca8';
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Entrants will appear here', cx, cy - 70);
      return;
    }

    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = rotation + i * seg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = n === 1 ? COLORS[5] : segColor(i, n);
      ctx.fill();
      if (n <= 120) {
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = n > 60 ? 1 : 3;
        ctx.stroke();
      }
    }

    // Names along each slice (skipped when there are too many to read)
    if (n <= 150) {
      const size = Math.max(11, Math.min(36, (seg * R * 0.75) / 1.2));
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = '#2b2140';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const maxW = R - 100;
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation + (i + 0.5) * seg);
        const full = entries[i].name;
        let label = full;
        while (label.length > 1 && ctx.measureText(label).width > maxW) label = label.slice(0, -1);
        if (label !== full) label = label.slice(0, -1) + '…';
        ctx.fillText(label, R - 22, 0);
        ctx.restore();
      }
    }

    // Rim
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  // Fair random integer in [0, n) using the browser's cryptographic randomness.
  function randomInt(n) {
    const max = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= max);
    return buf[0] % n;
  }

  const POINTER = -Math.PI / 2; // pointer sits at the top of the wheel
  const mod = (a, m) => ((a % m) + m) % m;
  const sliceAtPointer = (rot, seg) => Math.floor(mod(POINTER - rot, Math.PI * 2) / seg);

  function spin() {
    if (spinning) return;
    const n = entries.length;
    if (n < 2) {
      alert(n ? 'Add at least 2 people to spin.' : 'Nobody is on the wheel yet. Choose a post in step 2.');
      return;
    }
    spinning = true;
    $('#spin').disabled = true;

    const winner = randomInt(n);
    const seg = (Math.PI * 2) / n;
    const offset = 0.15 + (randomInt(1000) / 1000) * 0.7; // land somewhere inside the slice, not on a line
    const target = POINTER - (winner + offset) * seg;
    const start = rotation;
    const end = start + 8 * Math.PI * 2 + mod(target - start, Math.PI * 2);
    const duration = 7000;
    const t0 = performance.now();
    let lastSlice = sliceAtPointer(start, seg);

    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      rotation = start + (end - start) * eased;
      drawWheel();
      const s = sliceAtPointer(rotation, seg);
      if (s !== lastSlice) { lastSlice = s; tick(); }
      if (t < 1) return requestAnimationFrame(frame);
      rotation = mod(rotation, Math.PI * 2);
      spinning = false;
      $('#spin').disabled = false;
      announce(entries[winner]);
    }
    requestAnimationFrame(frame);
  }

  $('#spin').addEventListener('click', spin);

  // ---------- Sound ----------
  let audio;
  function tick() {
    if (!$('#sound').checked) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 1200;
      g.gain.setValueAtTime(0.05, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.04);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.05);
    } catch { /* no audio available */ }
  }
  function fanfare() {
    if (!$('#sound').checked || !audio) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      const t = audio.currentTime + i * 0.12;
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.45);
    });
  }

  // ---------- Winner ----------
  const modal = $('#modal');
  let currentWinner = null;

  function announce(p) {
    currentWinner = { name: p.name, personKey: p.key, at: new Date().toISOString(), removed: false };
    state.winners.push(currentWinner);
    save();
    renderHistory();

    // Show their comment(s) so it's easy to find them and congratulate them.
    const lines = [];
    for (const post of state.selected) {
      if (!p.posts.includes(post.key)) continue;
      const c = (state.comments[post.key] || []).find(c => post.platform + ':' + c.authorId === p.key && inTime(c));
      lines.push(`<li>${ICON[post.platform]} <a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">${SITE[post.platform]} post</a>` +
        (c && c.text ? `: “${escapeHtml(c.text.slice(0, 100))}”` : '') + '</li>');
    }
    $('#winnerName').textContent = p.name;
    $('#winnerSource').innerHTML = lines.length ? `<ul>${lines.join('')}</ul>` : '';
    modal.classList.remove('hidden');
    fanfare();
    confetti();
  }

  $('#closeModal').addEventListener('click', () => modal.classList.add('hidden'));
  $('#removeAndClose').addEventListener('click', () => {
    if (currentWinner) currentWinner.removed = true;
    modal.classList.add('hidden');
    recompute();
    renderHistory();
  });

  function renderHistory() {
    const el = $('#history');
    if (!state.winners.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<h3>🏆 Winners so far</h3>';
    const ol = document.createElement('ol');
    for (const w of state.winners) {
      const li = document.createElement('li');
      li.textContent = `${w.name} · ${new Date(w.at).toLocaleString()}`;
      ol.appendChild(li);
    }
    const clear = document.createElement('button');
    clear.className = 'btn link';
    clear.textContent = 'Clear winners list (puts everyone back on the wheel)';
    clear.addEventListener('click', () => {
      if (!confirm('Clear the winners list?')) return;
      state.winners = [];
      renderHistory();
      recompute();
    });
    el.append(ol, clear);
  }

  // ---------- Confetti ----------
  const cv = $('#confetti');
  const cx2 = cv.getContext('2d');
  function confetti() {
    cv.width = innerWidth;
    cv.height = innerHeight;
    const bits = Array.from({ length: 180 }, () => ({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * cv.height * 0.5,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 8,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    const t0 = performance.now();
    (function step(now) {
      cx2.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.vy += 0.05; b.r += b.vr;
        cx2.save();
        cx2.translate(b.x, b.y);
        cx2.rotate(b.r);
        cx2.fillStyle = b.c;
        cx2.fillRect(-b.w / 2, -b.w / 4, b.w, b.w / 2);
        cx2.restore();
      }
      if (now - t0 < 4500) requestAnimationFrame(step);
      else cx2.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }

  // ---------- Start ----------
  renderHistory();
  recompute();
  start();
})();
