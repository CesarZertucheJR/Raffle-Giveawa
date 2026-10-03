# 🎁 Giveaway Wheel

A simple website for running Instagram / Facebook giveaways.

1. **Add your posts.** Paste the post link, then copy and paste the list of people who **liked** it and all the **comments**.
2. **Check who's entered.** Only people who both liked *and* commented are entered. You can untick anyone, or add someone by hand.
3. **Spin the wheel!** A winner is picked at random. You can then remove the winner and spin again for a 2nd prize.

Everything runs in the browser. Nothing is uploaded anywhere, and your entries are remembered on that computer if you refresh the page.

## Why do I have to copy and paste?
Instagram and Facebook don't let websites download the list of people who liked a post. Instagram's official API only gives the *number* of likes, not the names, and both sites block automated scraping. Copying the lists from the post yourself is the reliable way. The site cleans out all the extra text ("Follow", "Reply", "2d", …) for you. Click **"How do I copy the likes and comments?"** on the site for step-by-step help.

## Good to know
- Instagram shows **usernames** (`maria_lopez`) and Facebook shows **names** (`Maria Lopez`), so the same person on both sites appears twice. Untick one if you want them to have only one entry.
- People only tagged in someone else's comment (`@friend`) are **not** counted as commenters.
- Winners are picked with the browser's secure random number generator, so every spot on the wheel has the same chance.

## Putting it online (free, with GitHub Pages)
1. On GitHub, go to this repo's **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, choose the branch (e.g. `main`) and folder `/ (root)`, and click **Save**.
3. After a minute, the site will be at `https://<your-username>.github.io/Raffle-Giveawa/`.

You can also just double-click `index.html` to open it on your computer.
