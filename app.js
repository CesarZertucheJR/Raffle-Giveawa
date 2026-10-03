(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const STORE = 'giveaway-wheel-v3';

  // Normalise a name for comparing: no "@", no extra spaces, lower case.
  const key = s => String(s || '').replace(/[​-‏﻿]/g, '').trim().replace(/^@/, '').replace(/\s+/g, ' ').toLowerCase();
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { instagram: '📸', facebook: '👍' };
  const SITE = { instagram: 'Instagram', facebook: 'Facebook' };

  // ---------- State (saved in this browser so a refresh doesn't lose anything) ----------
  const defaults = () => ({
    selected: [],   // posts grabbed: {key, platform, permalink, caption, thumb, grabbedAt}
    comments: {},   // post.key → [{authorId, author, text, time}]
    ownIds: [],     // "platform:id" of her own accounts, never entered
    exclude: '',
    manual: '',
    perPost: false,
    unchecked: [],  // person keys she unticked
    winners: [],    // {name, personKey, at, removed}
  });
  let state = Object.assign(defaults(), load());

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private mode */ }
  }

  // Another tab (e.g. one opened by the Grab button) changed things: pick them up.
  window.addEventListener('storage', e => {
    if (e.key !== STORE) return;
    state = Object.assign(defaults(), load());
    renderAll();
  });

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }

  // ---------- Step 1: the Grab comments bookmark ----------
  const siteUrl = location.href.split('#')[0].split('?')[0];
  const bookmarklet = 'javascript:' + encodeURIComponent(
    ('(' + window.GRAB_COMMENTS.toString() + ')(' + JSON.stringify(siteUrl) + ')').replace(/\s*\n\s*/g, ' ')
  );
  const bm = $('#bookmarklet');
  bm.href = bookmarklet;
  bm.addEventListener('click', e => {
    e.preventDefault();
    alert('Don’t click me here. Drag me up to your bookmarks bar!\n\nThen open your giveaway post on Instagram or Facebook and click “Grab comments” in the bookmarks bar.');
  });
  $('#copyBookmarklet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      toast('Copied! Now make a new bookmark and paste this as its address (URL).');
    } catch {
      prompt('Copy all of this, then paste it as the address (URL) of a new bookmark:', bookmarklet);
    }
  });

  // ---------- Step 2: posts sent over by the Grab button ----------
  function postKey(platform, url) {
    let u;
    try { u = new URL(url); } catch { return platform + ':' + url; }
    const path = u.pathname.replace(/\/+$/, '');
    const ig = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (ig) return 'instagram:' + ig[1];
    const pf = (path + u.search).match(/pfbid[A-Za-z0-9]+/);
    if (pf) return 'facebook:' + pf[0];
    for (const p of ['story_fbid', 'fbid', 'v']) {
      const v = u.searchParams.get(p);
      if (v && /^\d+$/.test(v)) return 'facebook:' + v;
    }
    const num = path.match(/\/(?:posts|videos|photos|reel)\/(?:[^/]+\/)?(\d{6,})$/);
    if (num) return 'facebook:' + num[1];
    return platform + ':' + u.host + path;
  }

  function addGrabbed(d) {
    const k = postKey(d.platform, d.url);
    const post = {
      key: k, platform: d.platform, permalink: d.url,
      caption: d.title || '', thumb: d.thumb || '', grabbedAt: new Date().toISOString(),
    };
    const i = state.selected.findIndex(p => p.key === k);
    if (i >= 0) state.selected[i] = post; else state.selected.push(post);
    state.comments[k] = (d.comments || []).map(([authorId, author, text, time]) => ({ authorId, author, text, time }));
    if (d.owner) state.ownIds = [...new Set([...state.ownIds, d.platform + ':' + d.owner])];
    return { post, again: i >= 0 };
  }

  function importFromHash() {
    const m = location.hash.match(/^#import=(.+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    let d;
    try { d = JSON.parse(decodeURIComponent(m[1])); } catch {
      toast('⚠️ Something went wrong reading those comments. Please try the button again.');
      return;
    }
    const { post, again } = addGrabbed(d);
    renderAll();
    const n = state.comments[post.key].length;
    toast(`✅ ${again ? 'Updated' : 'Added'} your ${SITE[post.platform]} post: ${n} comment${n === 1 ? '' : 's'}.`);
    setTimeout(() => $('#entrantsCard').scrollIntoView({ behavior: 'smooth' }), 400);
  }
  window.addEventListener('hashchange', importFromHash);

  function removePost(post) {
    if (!confirm('Remove this post from the giveaway?')) return;
    state.selected = state.selected.filter(p => p.key !== post.key);
    delete state.comments[post.key];
    renderAll();
  }

  function ago(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString();
  }

  function renderSelected() {
    const box = $('#selected');
    box.innerHTML = '';
    $('#setupBox').open = !state.selected.length;
    if (!state.selected.length) {
      box.innerHTML = '<p class="hint">No posts yet. Your posts will show up here after you use the button.</p>';
      return;
    }
    const own = new Set(state.ownIds);
    for (const post of state.selected) {
      const list = (state.comments[post.key] || []).filter(c => !own.has(post.platform + ':' + c.authorId));
      const people = new Set(list.map(c => c.authorId)).size;
      const el = document.createElement('div');
      el.className = 'sel';
      el.innerHTML = `
        ${post.thumb ? `<img src="${escapeHtml(post.thumb)}" alt="" referrerpolicy="no-referrer">` : '<div class="noimg">' + ICON[post.platform] + '</div>'}
        <div class="sel-body">
          <div class="sel-title">${ICON[post.platform]} ${SITE[post.platform]} post
            <a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">open ↗</a></div>
          <div class="sel-caption">${escapeHtml(post.caption.slice(0, 120))}</div>
          <div class="sel-status">💬 <b>${list.length}</b> comment${list.length === 1 ? '' : 's'} from <b>${people}</b> ${people === 1 ? 'person' : 'people'} · grabbed ${ago(post.grabbedAt)}</div>
        </div>
        <div class="sel-actions">
          <button class="btn link remove" title="Remove this post">✕ Remove</button>
        </div>`;
      const img = $('img', el);
      if (img) img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('div'), { className: 'noimg', textContent: ICON[post.platform] })));
      $('.remove', el).addEventListener('click', () => removePost(post));
      box.appendChild(el);
    }
  }

  $('#loadExample').addEventListener('click', () => {
    if (state.selected.length && !confirm('Replace your posts with example posts?')) return;
    const day = 864e5, t = d => new Date(Date.now() - d * day).toISOString();
    state.selected = [];
    state.comments = {};
    addGrabbed({
      platform: 'instagram', url: 'https://www.instagram.com/p/EXAMPLE1/', owner: 'rosas_sweets',
      title: 'Rosa on Instagram: "🎉 GIVEAWAY! Comment to win a dozen cupcakes!"',
      comments: [['sunny.days', '@sunny.days', 'Pick me!! @lil_lulu', t(2)], ['bakerbella', '@bakerbella', 'Entered 🤞', t(2)],
        ['joe.garcia', '@joe.garcia', 'yesss', t(1)], ['sunny.days', '@sunny.days', 'Sharing to my story too!', t(1)],
        ['mark_the_shark', '@mark_the_shark', '🔥🔥🔥', t(0.5)], ['rosas_sweets', '@rosas_sweets', 'Good luck everyone! ❤️', t(0.4)],
        ['tina.bakes', '@tina.bakes', 'Love your stuff', t(0.2)]],
    });
    addGrabbed({
      platform: 'facebook', url: 'https://www.facebook.com/RosasSweetTreats/posts/pfbid0Example', owner: 'rosassweettreats',
      title: 'GIVEAWAY TIME! Comment below for a chance to win 🎂',
      comments: [['marialopez', 'Maria Lopez', 'Count me in! ❤️', ''], ['100012345', 'Aunt Rosa', 'So pretty!!', ''],
        ['joe.garcia.77', 'Joe Garcia', 'Me me me 😄', ''], ['rosassweettreats', 'Rosa’s Sweet Treats', 'Winner announced Friday!', ''],
        ['danny.ruiz', 'Danny Ruiz', 'Hope I win', '']],
    });
    renderAll();
  });

  function renderAll() {
    excludeEl.value = state.exclude;
    manualEl.value = state.manual;
    perPostEl.checked = state.perPost;
    renderSelected();
    renderHistory();
    recompute();
  }

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
        if (!c.author || !c.authorId || own.has(post.platform + ':' + c.authorId)) continue;
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
      : 'Nobody yet. Grab the comments from a post (step 2) and everyone who commented will show up here.';

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
      alert(n ? 'Add at least 2 people to spin.' : 'Nobody is on the wheel yet. Grab the comments from a post first (step 2).');
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
      const c = (state.comments[post.key] || []).find(c => post.platform + ':' + c.authorId === p.key);
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
  renderAll();
  importFromHash();
})();
