(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const STORE = 'giveaway-wheel-v1';

  // ---------- State (saved in this browser so a refresh doesn't lose anything) ----------
  const blankPost = () => ({ url: '', likes: '', comments: '' });
  let state = load() || {
    posts: [blankPost()],
    exclude: '',
    manual: '',
    perPost: false,
    unchecked: [],  // keys of people she unticked
    winners: [],    // {name, at}
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private mode */ }
  }

  // ---------- Posts ----------
  const postsEl = $('#posts');
  const tpl = $('#postTpl');

  function renderPosts() {
    postsEl.innerHTML = '';
    state.posts.forEach((post, i) => {
      const el = tpl.content.firstElementChild.cloneNode(true);
      const url = $('.url', el), likes = $('.likes', el), comments = $('.comments', el);
      url.value = post.url;
      likes.value = post.likes;
      comments.value = post.comments;
      $('.remove', el).hidden = state.posts.length === 1;

      const onInput = () => {
        post.url = url.value.trim();
        post.likes = likes.value;
        post.comments = comments.value;
        updatePostHeader(el, post, i);
        recompute();
      };
      [url, likes, comments].forEach(f => f.addEventListener('input', onInput));
      $('.remove', el).addEventListener('click', () => {
        if (!confirm('Remove this post?')) return;
        state.posts.splice(i, 1);
        renderPosts();
        recompute();
      });
      updatePostHeader(el, post, i);
      postsEl.appendChild(el);
    });
  }

  function updatePostHeader(el, post, i) {
    const platform = Parse.detectPlatform(post.url);
    const label = { instagram: '📸 Instagram', facebook: '👍 Facebook', unknown: '🔗' }[platform];
    $('.badge', el).textContent = `${label} post ${i + 1}`;
    $('.badge', el).dataset.platform = platform;
    const open = $('.open', el);
    if (/^https?:\/\//i.test(post.url)) { open.href = post.url; open.classList.remove('disabled'); }
    else { open.removeAttribute('href'); open.classList.add('disabled'); }

    const r = Parse.matchPost(post);
    const stats = $('.post-stats', el);
    if (!post.likes.trim() && !post.comments.trim()) {
      stats.textContent = '';
    } else if (!post.likes.trim()) {
      stats.textContent = '👉 Now paste the likes list.';
    } else if (!post.comments.trim()) {
      stats.textContent = `Found ${r.likers.length} people who liked. 👉 Now paste the comments.`;
    } else {
      stats.innerHTML = `Found <b>${r.likers.length}</b> who liked → <b>${r.both.length}</b> of them also commented ✅`;
    }
  }

  $('#addPost').addEventListener('click', () => {
    state.posts.push(blankPost());
    renderPosts();
    save();
    postsEl.lastElementChild.querySelector('.url').focus();
  });

  // ---------- Entrants ----------
  const excludeEl = $('#exclude'), manualEl = $('#manual'), perPostEl = $('#perPost');
  excludeEl.value = state.exclude;
  manualEl.value = state.manual;
  perPostEl.checked = state.perPost;
  excludeEl.addEventListener('input', () => { state.exclude = excludeEl.value; recompute(); });
  manualEl.addEventListener('input', () => { state.manual = manualEl.value; recompute(); });
  perPostEl.addEventListener('change', () => { state.perPost = perPostEl.checked; recompute(); });

  let people = [];   // [{key, name, posts:[i], manual}]
  let entries = [];  // names on the wheel (with repeats when perPost)

  function recompute() {
    const excluded = new Set(state.exclude.split(',').map(Parse.key).filter(Boolean));
    const winnersRemoved = new Set(state.winners.filter(w => w.removed).map(w => Parse.key(w.name)));
    const map = new Map();
    const likedOnly = new Map();

    state.posts.forEach((post, i) => {
      const r = Parse.matchPost(post);
      r.both.forEach(name => {
        const k = Parse.key(name);
        if (excluded.has(k)) return;
        if (!map.has(k)) map.set(k, { key: k, name, posts: [], manual: false });
        map.get(k).posts.push(i);
      });
      r.likedOnly.forEach(name => {
        const k = Parse.key(name);
        if (!excluded.has(k)) likedOnly.set(k, name);
      });
    });
    state.manual.split(/\r?\n/).map(Parse.clean).filter(Boolean).forEach(name => {
      const k = Parse.key(name);
      if (!map.has(k)) map.set(k, { key: k, name, posts: [], manual: true });
    });
    for (const k of map.keys()) likedOnly.delete(k);

    people = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    const unchecked = new Set(state.unchecked);
    entries = [];
    for (const p of people) {
      p.active = !unchecked.has(p.key) && !winnersRemoved.has(p.key);
      if (!p.active) continue;
      const n = state.perPost ? Math.max(1, p.posts.length) : 1;
      for (let j = 0; j < n; j++) entries.push(p.name);
    }

    renderEntrants(likedOnly, winnersRemoved);
    save();
    drawWheel();
  }

  function renderEntrants(likedOnly, winnersRemoved) {
    const box = $('#entrants');
    box.innerHTML = '';
    const active = people.filter(p => p.active).length;
    $('#summary').innerHTML = people.length
      ? `<b>${active}</b> ${active === 1 ? 'person' : 'people'} on the wheel` +
        (entries.length !== active ? ` (<b>${entries.length}</b> spots)` : '') +
        '. Untick anyone who shouldn’t be in it.'
      : 'Nobody yet. Paste the likes and comments for a post above and entrants will show up here.';

    for (const p of people) {
      const label = document.createElement('label');
      label.className = 'entrant' + (p.active ? '' : ' off');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.active;
      const won = winnersRemoved.has(p.key);
      cb.disabled = won;
      cb.addEventListener('change', () => {
        const set = new Set(state.unchecked);
        cb.checked ? set.delete(p.key) : set.add(p.key);
        state.unchecked = [...set];
        recompute();
      });
      const span = document.createElement('span');
      span.textContent = p.name;
      label.append(cb, span);
      if (won) label.append(tag('🏆 won'));
      else if (p.manual) label.append(tag('added'));
      else if (state.perPost && p.posts.length > 1) label.append(tag(`×${p.posts.length}`));
      box.appendChild(label);
    }

    $('#notMatchedCount').textContent = likedOnly.size;
    $('#notMatchedBox').hidden = likedOnly.size === 0;
    const chips = $('#notMatched');
    chips.innerHTML = '';
    for (const name of [...likedOnly.values()].sort((a, b) => a.localeCompare(b))) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = '+ ' + name;
      b.title = 'Add to the wheel';
      b.addEventListener('click', () => {
        manualEl.value = (manualEl.value.trim() ? manualEl.value.trim() + '\n' : '') + name;
        state.manual = manualEl.value;
        recompute();
      });
      chips.appendChild(b);
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
        let label = entries[i];
        while (label.length > 1 && ctx.measureText(label).width > maxW) label = label.slice(0, -1);
        if (label !== entries[i]) label = label.slice(0, -1) + '…';
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
      alert(n ? 'Add at least 2 people to spin.' : 'Nobody is on the wheel yet. Add a post in step 1.');
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

  function announce(name) {
    currentWinner = { name, at: new Date().toISOString(), removed: false };
    state.winners.push(currentWinner);
    save();
    renderHistory();

    const p = people.find(x => x.key === Parse.key(name));
    const sources = p && p.posts.length
      ? 'Entered on: ' + p.posts.map(i => {
          const pl = Parse.detectPlatform(state.posts[i].url);
          return `${pl === 'instagram' ? 'Instagram' : pl === 'facebook' ? 'Facebook' : ''} post ${i + 1}`.trim();
        }).join(', ')
      : '';
    $('#winnerName').textContent = name;
    $('#winnerSource').textContent = sources;
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

  // ---------- Example data ----------
  $('#loadExample').addEventListener('click', () => {
    const hasData = state.posts.some(p => p.likes.trim() || p.comments.trim());
    if (hasData && !confirm('Replace what you have with example data?')) return;
    state.posts = [
      {
        url: 'https://www.instagram.com/p/EXAMPLE/',
        likes: "sunny.days's profile picture\nsunny.days\nSunny Day\nFollow\nbakerbella's profile picture\nbakerbella\nBella Baker\nFollowing\ntaco_tuesday's profile picture\ntaco_tuesday\nFollow\njoe.garcia's profile picture\njoe.garcia\nJoe Garcia\nFollow\nlil_lulu's profile picture\nlil_lulu\nFollow\nmark_the_shark's profile picture\nmark_the_shark\nFollow",
        comments: 'sunny.days\n2d\nI want this so bad!! @lil_lulu\nReply\nbakerbella\nVerified\n2d\nEntered 🤞\n1 like\nReply\njoe.garcia\n1d\nPick me!!\nReply\nmark_the_shark\n5h\n🔥🔥🔥\nReply\nnot_a_liker\n3h\nyay\nReply',
      },
      {
        url: 'https://www.facebook.com/photo/?fbid=EXAMPLE',
        likes: 'Maria Lopez\nAdd friend\nJoe Garcia\nMessage\nAunt Rosa\n3 mutual friends\nAdd friend\nDanny Ruiz\nAdd friend',
        comments: 'Maria Lopez\nCount me in! ❤️\n2d\nLike\nReply\nAunt Rosa\nTop fan\nSo pretty!!\n1d\nLike\nReply\nJoe Garcia\nMe me me 😄\n5h\nLike\nReply',
      },
    ];
    renderPosts();
    recompute();
  });

  // ---------- Start ----------
  renderPosts();
  renderHistory();
  recompute();
})();
