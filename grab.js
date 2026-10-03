/*
 * The "Grab comments" bookmark button.
 *
 * The site turns this function into a bookmarklet (a bookmark whose address is
 * JavaScript). When it is clicked on an Instagram or Facebook post, it opens
 * every comment and reply, collects who wrote each one, and sends the list back
 * to the Giveaway Wheel.
 *
 * It runs inside instagram.com / facebook.com, so:
 *   - it must be self-contained (those sites block outside scripts);
 *   - use only block comments in this function, and end every statement with a
 *     semicolon, because the bookmarklet is squeezed onto one line;
 *   - never use innerHTML (Facebook rejects it); use textContent.
 * It relies on page structure rather than class names, because those change
 * constantly. If Instagram or Facebook redesign, this is the file to fix.
 */
window.GRAB_COMMENTS = function (SITE) {
  if (document.getElementById('gw-box')) return;
  var host = location.hostname;
  var platform = /(^|\.)instagram\.com$/.test(host) ? 'instagram' : /(^|\.)facebook\.com$/.test(host) ? 'facebook' : null;
  if (!platform) {
    alert('Open your Instagram or Facebook post first, then click this button.');
    return;
  }

  var found = new Map();
  var owner = null;
  var lastNode = null;
  var stopped = false;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var text = function (el) { return ((el && (el.innerText || el.textContent)) || '').trim(); };

  /* ---------- Little progress box shown on top of the post ---------- */
  function el(tag, css, txt) {
    var e = document.createElement(tag);
    e.style.cssText = css;
    if (txt) e.textContent = txt;
    return e;
  }
  var BTN = 'display:block;width:100%;border:0;border-radius:999px;padding:12px 16px;margin-top:8px;font:700 15px system-ui,sans-serif;cursor:pointer;background:#8b5cf6;color:#fff;';
  var box = el('div', 'position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;color:#2b2140;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:18px;font:15px/1.45 system-ui,sans-serif;text-align:center;');
  box.id = 'gw-box';
  var title = el('div', 'font-weight:800;font-size:18px;', '🎁 Giveaway Wheel');
  var msg = el('div', 'margin:10px 0 4px;', 'Opening all the comments… please wait.');
  var main = el('button', BTN, 'Stop and use what’s found');
  var cancel = el('button', BTN + 'background:#f1e9ff;color:#2b2140;', 'Cancel');
  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(main);
  box.appendChild(cancel);
  document.body.appendChild(box);
  main.onclick = function () { stopped = true; main.disabled = true; main.textContent = 'Finishing…'; };
  cancel.onclick = function () { stopped = true; box.remove(); };

  /* ---------- Where the post's comments live ---------- */
  function root() {
    var need = platform === 'instagram' ? 'time' : '[role="article"]';
    var dialogs = Array.prototype.filter.call(document.querySelectorAll('[role="dialog"]'), function (d) { return d.querySelector(need); });
    if (dialogs.length) return dialogs[dialogs.length - 1];
    if (platform === 'instagram') return document.querySelector('main') || document.body;
    var mainEl = document.querySelector('[role="main"]') || document.body;
    var posts = Array.prototype.filter.call(mainEl.querySelectorAll('[role="article"]'), function (a) {
      return !(a.parentElement && a.parentElement.closest('[role="article"]')) && a.querySelector('[role="article"]');
    });
    return posts.length ? posts[0] : mainEl;
  }

  /* ---------- Clicking "view more comments" / "view replies" ---------- */
  var MORE = platform === 'instagram'
    ? /^(view (all )?(\d+ )?(more )?repl(y|ies)|view replies|load more comments|view more comments|view all \d+ comments)/i
    : /^((view|see) (\d+ )?(more|previous|all)? ?(\d+ )?(more )?(comments?|repl(y|ies))|\d+ (more )?repl(y|ies)$)/i;

  function clickMore() {
    var n = 0;
    var r = root();
    var buttons = r.querySelectorAll('[role="button"], button');
    for (var i = 0; i < buttons.length && n < 15; i++) {
      var b = buttons[i];
      if (box.contains(b) || b.querySelector('[role="button"], button')) continue;
      var t = text(b).split('\n')[0].replace(/^[^A-Za-z0-9]+/, '');
      var svg = b.querySelector('svg[aria-label]');
      var label = (svg ? svg.getAttribute('aria-label') : '') + ' ' + (b.getAttribute('aria-label') || '');
      if (MORE.test(t) || /load more comments/i.test(label)) {
        b.click();
        n++;
      }
    }
    return n;
  }

  /* Facebook hides some comments under "Most relevant"; switch to "All comments". */
  async function facebookAllComments() {
    var r = root();
    var sw = Array.prototype.find.call(r.querySelectorAll('[role="button"]'), function (b) {
      return /^(most relevant|top comments|newest)$/i.test(text(b));
    });
    if (!sw) return;
    sw.click();
    await sleep(1200);
    var item = Array.prototype.find.call(document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'), function (m) {
      return /^all comments/i.test(text(m));
    });
    if (item) item.click(); else sw.click();
    await sleep(1500);
  }

  function scrollDown() {
    var n = lastNode;
    while (n && n !== document.body) {
      if (n.scrollHeight > n.clientHeight + 20) {
        var o = getComputedStyle(n).overflowY;
        if (o === 'auto' || o === 'scroll') n.scrollTop = n.scrollHeight;
      }
      n = n.parentElement;
    }
    if (platform === 'instagram' || !lastNode) window.scrollTo(0, document.documentElement.scrollHeight);
    else lastNode.scrollIntoView({ block: 'end' });
  }

  /* ---------- Reading who wrote each comment ---------- */
  var JUNK = /^(reply|like|likes|share|see translation|translate|see more|verified|author|top fan|follow|following|edited|hide|hide replies|view replies|[·•]|\d+\s*[smhdwy]|\d+ (likes?|replies|reactions?)|\d+ (second|minute|hour|day|week|month|year)s? ago|a few seconds ago|just now|yesterday)$/i;

  /* "bakerbella Verified 2d" → "", "sunny.days Pick me!" → "Pick me!" */
  var BADGE = /^(verified|author|top fan|[·•]|\d+\s*[smhdwy])(\s+|$)/i;
  var BADGE_END = /(^|\s+)(verified|author|top fan|[·•]|\d+\s*[smhdwy])$/i;
  function tidy(line, name) {
    var l = line.trim();
    var n = name.toLowerCase();
    if (l.toLowerCase().indexOf('@' + n) === 0) l = l.slice(n.length + 1).trim();
    else if (l.toLowerCase().indexOf(n) === 0) l = l.slice(n.length).trim();
    for (var i = 0; i < 4; i++) l = l.replace(BADGE, '').replace(BADGE_END, '').replace(/\s*(Reply|Like|See translation)$/, '').trim();
    return l;
  }

  function commentText(node, name) {
    var n = node;
    for (var i = 0; n && i < 4; i++, n = n.parentElement) {
      if (i > 0 && n.querySelectorAll(platform === 'instagram' ? 'time' : '[role="article"]').length > 1) break;
      var lines = text(n).split('\n');
      for (var j = 0; j < lines.length; j++) {
        var l = tidy(lines[j], name);
        if (l && !JUNK.test(l)) return l.slice(0, 100);
      }
    }
    return '';
  }

  function igUser(a) {
    var path;
    try { path = new URL(a.href).pathname; } catch (e) { return null; }
    var m = path.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
    return m && text(a).toLowerCase() === m[1].toLowerCase() ? m[1] : null;
  }

  function collectInstagram() {
    var r = root();
    if (!owner) {
      var header = r.querySelector('header');
      var hl = header ? header.querySelectorAll('a[href]') : [];
      for (var h = 0; h < hl.length && !owner; h++) owner = igUser(hl[h]);
      if (owner) owner = owner.toLowerCase();
    }
    var times = Array.prototype.slice.call(r.querySelectorAll('time'));
    var commentTimes = times.filter(function (t) {
      var a = t.closest('a');
      return a && /\/c\/\d+/.test(a.getAttribute('href') || '');
    });
    if (commentTimes.length) times = commentTimes;
    times.forEach(function (t) {
      var node = t.parentElement;
      var user = null;
      for (var i = 0; node && node !== r && i < 12 && !user; i++) {
        var links = node.querySelectorAll('a[href]');
        for (var j = 0; j < links.length && !user; j++) user = igUser(links[j]);
        if (!user) node = node.parentElement;
      }
      if (!user || !node) return;
      var k = user.toLowerCase() + '|' + (t.getAttribute('datetime') || text(t));
      if (!found.has(k)) found.set(k, { id: user.toLowerCase(), name: '@' + user, text: commentText(node, user), time: t.getAttribute('datetime') || '' });
      lastNode = node;
    });
  }

  function fbId(href) {
    try {
      var u = new URL(href, location.href);
      if (u.pathname === '/profile.php') return u.searchParams.get('id');
      var g = u.pathname.match(/\/user\/(\d+)/);
      if (g) return g[1];
      var seg = u.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.toLowerCase() : null;
    } catch (e) { return null; }
  }

  function collectFacebook() {
    var r = root();
    var arts = Array.prototype.slice.call(r.querySelectorAll('[role="article"]'));
    var labeled = arts.filter(function (a) { return /^(comment|reply) by /i.test(a.getAttribute('aria-label') || ''); });
    arts = labeled.length ? labeled : arts.filter(function (a) { return a !== r && a.parentElement && a.parentElement.closest('[role="article"]'); });
    arts.forEach(function (a) {
      var label = a.getAttribute('aria-label') || '';
      var links = Array.prototype.filter.call(a.querySelectorAll('a[href]'), function (l) {
        var t = text(l);
        return t && l.closest('[role="article"]') === a && !JUNK.test(t);
      });
      var link = links.find(function (l) { return label && label.indexOf(' by ' + text(l)) >= 0; }) || links[0];
      if (!link) return;
      var name = text(link).split('\n')[0];
      var id = fbId(link.href) || name.toLowerCase();
      var said = commentText(a, name);
      var header = said ? text(a).split(said)[0] : text(a);
      if (/(^|\n)author(\n|$)/i.test(header)) owner = owner || id;
      var k = id + '|' + label + '|' + said;
      if (!found.has(k)) found.set(k, { id: id, name: name, text: said, time: '' });
      lastNode = a;
    });
  }

  var collect = platform === 'instagram' ? collectInstagram : collectFacebook;

  /* ---------- Main loop: keep opening comments until nothing new shows up ---------- */
  async function run() {
    if (platform === 'facebook') await facebookAllComments();
    collect();
    var idle = 0;
    for (var round = 0; round < 400 && !stopped; round++) {
      var clicked = clickMore();
      scrollDown();
      await sleep(clicked ? 1600 : 1000);
      var before = found.size;
      collect();
      msg.textContent = 'Opening all the comments… found ' + found.size + ' so far.';
      idle = !clicked && found.size === before ? idle + 1 : 0;
      if (idle >= 4) break;
    }
    if (!box.isConnected) return;
    collect();
    finish();
  }

  function finish() {
    var list = Array.from(found.values());
    var people = new Set(list.filter(function (c) { return c.id !== owner; }).map(function (c) { return c.id; })).size;
    main.disabled = false;
    cancel.textContent = 'Close';
    if (!list.length) {
      msg.textContent = 'No comments found. Make sure the post itself is open (on Facebook, click the post’s date), then try again.';
      main.style.display = 'none';
      return;
    }
    msg.textContent = 'Found ' + list.length + ' comment' + (list.length === 1 ? '' : 's') + ' from ' + people + ' ' + (people === 1 ? 'person' : 'people') + '.';
    main.textContent = 'Send to Giveaway Wheel 🎡';
    main.onclick = function () { send(list); };
  }

  function meta(p) {
    var m = document.querySelector('meta[property="' + p + '"]');
    return m ? m.getAttribute('content') || '' : '';
  }

  function send(list) {
    var url = platform === 'instagram' ? location.origin + location.pathname : location.href.split('#')[0];
    var payload = {
      v: 1,
      platform: platform,
      url: url,
      title: (meta('og:title') || document.title).slice(0, 150),
      thumb: meta('og:image'),
      owner: owner,
      comments: list.map(function (c) { return [c.id, c.name, c.text, c.time]; }),
    };
    var data = JSON.stringify(payload);
    if (data.length > 60000) {
      payload.comments = list.map(function (c) { return [c.id, c.name, '', c.time]; });
      data = JSON.stringify(payload);
    }
    var target = SITE + '#import=' + encodeURIComponent(data);
    box.remove();
    var w = window.open(target, 'giveawayWheel');
    if (!w) location.href = target;
  }

  run();
};
