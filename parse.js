// Turns text copied from Instagram / Facebook into lists of names.
// Works in the browser (window.Parse) and in Node (module.exports) for testing.
(function (root) {
  // Words and buttons that show up when you copy a list, but aren't names.
  const JUNK = new Set([
    'follow', 'following', 'follow back', 'message', 'add friend', 'remove', 'requested',
    'like', 'likes', 'liked', 'reply', 'replies', 'view replies', 'hide replies', 'see translation',
    'verified', 'all', 'reactions', 'comment', 'comments', 'share', 'send', 'author', 'top fan',
    'most relevant', 'newest', 'all comments', 'view more comments', 'write a comment',
    'write a comment…', 'write a comment...', 'edited', 'pinned', 'search', 'close', 'see more',
    'more', 'translate', 'original audio', 'suggested for you', 'liked by', 'add a comment…',
    'add a comment...', 'post', 'log in', 'sign up', 'and others', 'love', 'care', 'haha', 'wow',
    'sad', 'angry', 'mutual friend', 'friends',
  ]);

  // Strip invisible characters, "@", badges and trailing times like "2w".
  function clean(s) {
    let t = String(s)
      .replace(/[​-‏‪-‮⁠﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^@/, '');
    let prev;
    do {
      prev = t;
      t = t
        .replace(/\s*[·•]\s*(follow|following|author|top fan|edited)?.*$/i, '')
        .replace(/\s+(verified|✔️?|☑️?)$/i, '')
        .replace(/\s+\d+\s*(s|m|h|d|w|y|min|mins|hr|hrs)$/i, '')
        .trim();
    } while (t !== prev);
    return t;
  }

  function key(s) {
    return clean(s).toLowerCase();
  }

  function isJunk(line) {
    const k = line.toLowerCase();
    if (!k) return true;
    if (JUNK.has(k)) return true;
    if (/^\d[\d.,]*\s*[kmb]?$/i.test(k)) return true;              // "25", "1.2k"
    if (/^\d+\s*(s|m|h|d|w|y|min|mins|hr|hrs)$/i.test(k)) return true; // "2w"
    if (/^\d+\s*(likes?|replies|reactions?|comments?|shares?)$/i.test(k)) return true;
    if (/mutual friends?$/i.test(k)) return true;
    if (/^(view|see|hide) (all )?\d*/i.test(k)) return true;
    if (/profile picture$/i.test(k)) return true;
    if (k.length > 60) return true; // a sentence, not a name
    return false;
  }

  const IG_USERNAME = /^[a-z0-9._]{1,30}$/i;

  function detectPlatform(url) {
    const u = String(url || '').toLowerCase();
    if (/instagram\.com|instagr\.am/.test(u)) return 'instagram';
    if (/facebook\.com|fb\.com|fb\.watch|fb\.me/.test(u)) return 'facebook';
    return 'unknown';
  }

  // Returns the names of everyone in a pasted "likes" list (original spelling, no duplicates).
  function parseLikers(text, platform) {
    const lines = String(text || '').split(/\r?\n/);
    const out = new Map();

    // Instagram sometimes copies "maria_lopez's profile picture" – the most reliable signal.
    for (const raw of lines) {
      const m = raw.trim().match(/^(.+?)['’]s profile picture$/i);
      if (m) {
        const name = clean(m[1]);
        if (name) out.set(key(name), name);
      }
    }
    if (out.size) return [...out.values()];

    for (const raw of lines) {
      const name = clean(raw);
      if (isJunk(name)) continue;
      if (platform === 'instagram' && !IG_USERNAME.test(name)) continue; // skip full names
      if (!out.has(key(name))) out.set(key(name), name);
    }
    return [...out.values()];
  }

  // Set of keys for every line in the comments paste. A commenter's name sits on its own line.
  function commentKeys(text) {
    const set = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      if (raw.trim().startsWith('@')) continue; // "@friend" is a tag, not the person commenting
      const m = raw.trim().match(/^(.+?)['’]s profile picture$/i);
      const k = key(m ? m[1] : raw);
      if (k) set.add(k);
    }
    return set;
  }

  // Split likers into those who also commented and those who didn't.
  function matchPost(post) {
    const platform = detectPlatform(post.url);
    const likers = parseLikers(post.likes, platform);
    const keys = commentKeys(post.comments);
    const both = [];
    const likedOnly = [];
    for (const name of likers) (keys.has(key(name)) ? both : likedOnly).push(name);
    return { platform, likers, both, likedOnly };
  }

  const api = { clean, key, isJunk, detectPlatform, parseLikers, commentKeys, matchPost };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parse = api;
})(this);
