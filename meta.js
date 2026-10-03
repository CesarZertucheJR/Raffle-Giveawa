// Talks to Facebook / Instagram through Meta's official Graph API.
// One "Log in with Facebook" gives access to her Facebook Page and the
// Instagram professional account linked to it.
//
// Every source (real or demo) has the same shape:
//   init()                 → Promise<bool loggedIn>
//   login() / logout()
//   accounts()             → [{platform, id, name, token}]
//   recentPosts(account)   → [{key, platform, id, permalink, caption, thumb, time}]
//   comments(post)         → [{authorId, author, text, time}]
(function () {
  const SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_read_user_content',
    'business_management',
    'instagram_basic',
    'instagram_manage_comments',
  ].join(',');

  // ---------- Real Graph API ----------
  function graphSource(appId, version) {
    let accountsCache = [];

    function loadSdk() {
      return new Promise((resolve, reject) => {
        if (window.FB) return resolve();
        window.fbAsyncInit = () => {
          FB.init({ appId, version, cookie: true, xfbml: false });
          resolve();
        };
        const s = document.createElement('script');
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true;
        s.onerror = () => reject(new Error('Could not load Facebook. Check your internet connection or ad blocker.'));
        document.head.appendChild(s);
      });
    }

    function api(path, params = {}) {
      return new Promise((resolve, reject) => {
        FB.api(path, 'GET', params, res => {
          if (!res || res.error) reject(new Error(res && res.error ? res.error.message : 'Facebook did not answer.'));
          else resolve(res);
        });
      });
    }

    // Follow "next" links until done (or a sensible cap is reached).
    async function all(first, cap = 5000) {
      let res = first;
      const out = [...(res.data || [])];
      while (res.paging && res.paging.next && out.length < cap) {
        res = await (await fetch(res.paging.next)).json();
        if (res.error) throw new Error(res.error.message);
        out.push(...(res.data || []));
      }
      return out;
    }

    async function loadAccounts() {
      const res = await api('/me/accounts', {
        fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}',
        limit: 100,
      });
      const pages = await all(res);
      accountsCache = [];
      for (const p of pages) {
        accountsCache.push({ platform: 'facebook', id: p.id, name: p.name, token: p.access_token });
        const ig = p.instagram_business_account;
        if (ig) accountsCache.push({ platform: 'instagram', id: ig.id, name: '@' + ig.username, username: ig.username, token: p.access_token });
      }
      return accountsCache;
    }

    return {
      demo: false,
      async init() {
        await loadSdk();
        const status = await new Promise(r => FB.getLoginStatus(r));
        if (status.status !== 'connected') return false;
        await loadAccounts();
        return true;
      },
      async login() {
        await loadSdk();
        const res = await new Promise(r => FB.login(r, { scope: SCOPES, return_scopes: true }));
        if (res.status !== 'connected') throw new Error('Login was cancelled.');
        await loadAccounts();
      },
      async logout() {
        await new Promise(r => FB.logout(r));
        accountsCache = [];
      },
      accounts: () => accountsCache,

      async recentPosts(acct, limit = 60) {
        if (acct.platform === 'instagram') {
          const res = await api(`/${acct.id}/media`, {
            fields: 'id,permalink,caption,media_type,media_url,thumbnail_url,timestamp,comments_count',
            limit: 30, access_token: acct.token,
          });
          return (await all(res, limit)).map(m => ({
            key: 'ig:' + m.id, platform: 'instagram', id: m.id, accountId: acct.id,
            permalink: m.permalink, caption: m.caption || '', time: m.timestamp,
            thumb: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
            commentCount: m.comments_count,
          }));
        }
        const res = await api(`/${acct.id}/posts`, {
          fields: 'id,permalink_url,message,full_picture,created_time',
          limit: 30, access_token: acct.token,
        });
        return (await all(res, limit)).map(p => ({
          key: 'fb:' + p.id, platform: 'facebook', id: p.id, accountId: acct.id,
          permalink: p.permalink_url, caption: p.message || '', time: p.created_time,
          thumb: p.full_picture,
        }));
      },

      async comments(post) {
        const acct = accountsCache.find(a => a.id === post.accountId);
        if (!acct) throw new Error('Log in again to read this post.');
        if (post.platform === 'instagram') {
          const res = await api(`/${post.id}/comments`, {
            fields: 'id,username,text,timestamp,from{id,username},replies.limit(100){id,username,text,timestamp,from{id,username}}',
            limit: 50, access_token: acct.token,
          });
          const out = [];
          for (const c of await all(res)) {
            for (const x of [c, ...((c.replies && c.replies.data) || [])]) {
              const username = x.username || (x.from && x.from.username);
              if (!username) continue;
              out.push({ authorId: username.toLowerCase(), author: '@' + username, text: x.text || '', time: x.timestamp });
            }
          }
          return out;
        }
        // filter=stream returns replies too, all in one flat list.
        const res = await api(`/${post.id}/comments`, {
          fields: 'id,from{id,name},message,created_time',
          filter: 'stream', limit: 100, access_token: acct.token,
        });
        return (await all(res)).map(c => ({
          authorId: c.from ? c.from.id : null,
          author: c.from ? c.from.name : null, // Facebook hides some people's names
          text: c.message || '', time: c.created_time,
        }));
      },
    };
  }

  // ---------- Demo (fake data, for trying the site without logging in) ----------
  function demoSource() {
    let loggedIn = false;
    const day = 864e5, now = Date.now();
    const ago = d => new Date(now - d * day).toISOString();
    const pic = (seed, c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='${c}'/><text x='50' y='62' font-size='40' text-anchor='middle'>${seed}</text></svg>`)}`;
    const acc = [
      { platform: 'facebook', id: 'page1', name: 'Rosa’s Sweet Treats', token: 'x' },
      { platform: 'instagram', id: 'ig1', name: '@rosas_sweets', username: 'rosas_sweets', token: 'x' },
    ];
    const posts = [
      { key: 'ig:m1', platform: 'instagram', id: 'm1', accountId: 'ig1', permalink: 'https://www.instagram.com/p/DEMO1abc/', caption: '🎉 GIVEAWAY! Comment to win a dozen cupcakes!', time: ago(3), thumb: pic('🧁', '#ffd6e7'), commentCount: 7 },
      { key: 'ig:m2', platform: 'instagram', id: 'm2', accountId: 'ig1', permalink: 'https://www.instagram.com/p/DEMO2xyz/', caption: 'New cookie flavor this week', time: ago(9), thumb: pic('🍪', '#ffe8cc'), commentCount: 2 },
      { key: 'fb:page1_11', platform: 'facebook', id: 'page1_11', accountId: 'page1', permalink: 'https://www.facebook.com/RosasSweetTreats/posts/pfbid0DemoPost1', caption: 'GIVEAWAY TIME! Comment below for a chance to win 🎂', time: ago(3), thumb: pic('🎂', '#d0ebff') },
      { key: 'fb:page1_12', platform: 'facebook', id: 'page1_12', accountId: 'page1', permalink: 'https://www.facebook.com/RosasSweetTreats/posts/pfbid0DemoPost2', caption: 'Thank you all for 1,000 followers!', time: ago(12), thumb: pic('💐', '#d3f9d8') },
    ];
    const comments = {
      m1: [['sunny.days', 'Pick me!! @lil_lulu', 2], ['bakerbella', 'Entered 🤞', 2], ['joe.garcia', 'yesss', 1], ['sunny.days', 'Sharing to my story too!', 1], ['mark_the_shark', '🔥🔥🔥', 0.5], ['rosas_sweets', 'Good luck everyone! ❤️', 0.4], ['tina.bakes', 'Love your stuff', 0.2]],
      m2: [['bakerbella', 'Yum', 8], ['joe.garcia', 'Need these', 8]],
      page1_11: [['f1', 'Maria Lopez', 'Count me in! ❤️', 2], ['f2', 'Aunt Rosa', 'So pretty!!', 1], ['f3', 'Joe Garcia', 'Me me me 😄', 1], ['page1', 'Rosa’s Sweet Treats', 'Winner announced Friday!', 0.5], [null, null, 'Hi!', 0.3], ['f4', 'Danny Ruiz', 'Hope I win', 0.1]],
      page1_12: [['f1', 'Maria Lopez', 'Congrats!', 11]],
    };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    return {
      demo: true,
      async init() { return loggedIn; },
      async login() { await wait(400); loggedIn = true; },
      async logout() { loggedIn = false; },
      accounts: () => (loggedIn ? acc : []),
      async recentPosts(a) { await wait(300); return posts.filter(p => p.accountId === a.id); },
      async comments(post) {
        await wait(500);
        return (comments[post.id] || []).map(c => post.platform === 'instagram'
          ? { authorId: c[0], author: '@' + c[0], text: c[1], time: ago(c[2]) }
          : { authorId: c[0], author: c[1], text: c[2], time: ago(c[3]) });
      },
    };
  }

  // ---------- Matching a pasted link to one of her posts ----------
  function linkKeys(url) {
    const keys = [];
    let u;
    try { u = new URL(String(url).trim()); } catch { return keys; }
    const path = u.pathname.replace(/\/+$/, '');
    const ig = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (ig) keys.push('ig:' + ig[1]);
    const pf = (path + u.search).match(/pfbid[A-Za-z0-9]+/);
    if (pf) keys.push('fb:' + pf[0]);
    for (const p of ['story_fbid', 'fbid', 'v']) {
      const v = u.searchParams.get(p);
      if (v && /^\d+$/.test(v)) keys.push('fb:' + v);
    }
    const num = path.match(/\/(?:posts|videos|photos|reel)\/(?:[^/]+\/)?(\d{6,})$/);
    if (num) keys.push('fb:' + num[1]);
    return keys;
  }

  function postKeys(post) {
    const keys = linkKeys(post.permalink);
    if (post.platform === 'facebook') {
      const last = post.id.split('_').pop();
      keys.push('fb:' + last);
    }
    return keys;
  }

  function platformOf(url) {
    const u = String(url || '').toLowerCase();
    if (/instagram\.com|instagr\.am/.test(u)) return 'instagram';
    if (/facebook\.com|fb\.com|fb\.watch|fb\.me/.test(u)) return 'facebook';
    return null;
  }

  function matchLink(url, posts) {
    const want = new Set(linkKeys(url));
    if (!want.size) return null;
    return posts.find(p => postKeys(p).some(k => want.has(k))) || null;
  }

  const isDemo = new URLSearchParams(location.search).has('demo');
  const cfg = window.CONFIG || {};
  window.Meta = {
    source: isDemo ? demoSource() : cfg.FACEBOOK_APP_ID ? graphSource(cfg.FACEBOOK_APP_ID, cfg.GRAPH_VERSION || 'v23.0') : null,
    linkKeys, matchLink, platformOf,
  };
})();
