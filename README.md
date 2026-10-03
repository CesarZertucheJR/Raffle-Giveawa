# 🎁 Giveaway Wheel

A simple website for running Instagram and Facebook comment giveaways.

1. **Log in** with Facebook. One login covers your Facebook Page and the Instagram account linked to it.
2. **Choose your giveaway posts.** Paste a post link, or pick from your recent posts.
3. **Check who's entered.** Everyone who commented is entered once. Your own replies are left out automatically. You can untick people, add people by hand, and set a deadline.
4. **Spin the wheel!** The winner pops up with their comment and a link to the post. "Remove winner & spin again" picks more prizes.

Want to see it first? Open the site with `?demo` at the end of the address to try it with pretend data.

## What it needs
- **Facebook:** the giveaway posts must be on a **Facebook Page** you manage. Facebook doesn't let any app read comments on personal-profile posts.
- **Instagram:** the account must be a **Professional** account (Business or Creator, which is free to switch to in the Instagram app's settings) and **connected to that Facebook Page**.
- Facebook hides the names of some commenters because of their privacy settings. The site shows how many were hidden; add those people by hand if you can see who they are.

## One-time setup
Logging in with Facebook needs a (free) "app" registered with Meta. Because only your mom uses it, it can stay in **Development mode**, so Meta doesn't need to review it.

1. **Put the site online with GitHub Pages.** Facebook login only works on an `https://` website.
   On GitHub, open this repo's **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
   The site will be at `https://<your-username>.github.io/Raffle-Giveawa/`.
2. **Create the Meta app.** It's easiest to do this **logged in as your mom's Facebook account**, so she's automatically the app's admin.
   Go to [developers.facebook.com/apps](https://developers.facebook.com/apps). Register as a developer if asked, then click **Create app**.
   Pick the use case for managing a Page / "Other", choose the **Business** type if asked, and give it a name like "Giveaway Wheel".
3. **Turn on Facebook Login.** Add the **Facebook Login for Business** (or **Facebook Login**) product. In its settings:
   - turn **Login with the JavaScript SDK** on;
   - under **Allowed domains for the JavaScript SDK**, add `https://<your-username>.github.io/`;
   - under **Valid OAuth redirect URIs**, add the full site address from step 1.
4. In **App settings → Basic**:
   - add `<your-username>.github.io` to **App domains**;
   - set the **Privacy policy URL** to `https://<your-username>.github.io/Raffle-Giveawa/privacy.html`;
   - save, then copy the **App ID**.
5. **Paste the App ID** into `config.js` (`FACEBOOK_APP_ID: '1234567890123456'`), then commit and push.
6. If you created the app with **your** account instead of your mom's, add her under **App roles → Roles** as an Administrator or Tester. She has to accept the invite at developers.facebook.com.

The first time she logs in, Facebook asks which Pages and Instagram accounts to share. She should tick her Page and her Instagram account.

## Privacy
Everything runs in the browser. Posts and comments are kept only in that browser, and nothing is sent anywhere except to Facebook to read the comments. The site never posts or changes anything on her accounts.

## Files
- `index.html`, `style.css`: the page
- `app.js`: choosing posts, the entrant list, the wheel
- `meta.js`: Facebook and Instagram login and comment fetching (plus the `?demo` pretend data)
- `config.js`: the Meta App ID
- `privacy.html`: privacy policy page (Meta asks for one)
