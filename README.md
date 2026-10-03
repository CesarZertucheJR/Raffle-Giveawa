# 🎁 Giveaway Wheel

A simple website for running Instagram and Facebook comment giveaways.
Live at **https://cesarzertuchejr.github.io/Raffle-Giveawa/**

1. **Add the "Grab comments" button** (one time). Drag it from the site onto the browser's bookmarks bar.
2. **Grab the comments.** Open a giveaway post on instagram.com or facebook.com, click **🎁 Grab comments**, wait while it opens every comment and reply, then click **Send to Giveaway Wheel**. Repeat for each post.
3. **Check who's entered.** Everyone who commented gets one spot. Your own replies are left out automatically. You can untick people, add people by hand, or give an extra spot per post.
4. **Spin the wheel!** The winner pops up with their comment and a link to the post. "Remove winner & spin again" picks more prizes.

No Facebook developer setup or login is needed: the button reads the post you're already looking at, while you're logged in as usual. It works with personal Facebook profiles, Pages, and any Instagram account.

## Good to know
- Use a **computer** (Chrome, Edge, Firefox or Safari). Bookmark buttons don't work in the phone apps.
- On Facebook, open the post by itself (click its date) before using the button. The button switches comments to "All comments" so none are hidden.
- The same person on Instagram and Facebook shows up twice (username vs. name). Untick one if they should only get one spot.
- If Instagram or Facebook redesign their site, the button may stop finding comments. The code that would need fixing is `grab.js`.
- Everything stays in the browser. Nothing is sent to any server.

## Files
- `index.html`, `style.css`: the page
- `app.js`: posts, entrant list, wheel
- `grab.js`: the "Grab comments" button (turned into a bookmark by the page)
- `privacy.html`: privacy note
