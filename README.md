# sunilmtma.github.io

Personal research page of Sunil Choudhary. Live at **https://sunilmtma.github.io**.

Plain HTML, CSS and JavaScript. There is no build step: GitHub Pages serves the files as they are.

```
index.html                 all page content
assets/css/style.css       design tokens (colours, fonts) at the top, then layout
assets/js/main.js          digital twin figure, copy buttons, nav highlight
assets/img/photo.jpg       portrait
.nojekyll                  tells GitHub Pages not to run Jekyll
```

## Publish it (first time)

1. On GitHub, create a **public** repository named exactly `sunilmtma.github.io` (no README).
2. From this folder:
   ```
   git init -b main
   git add .
   git commit -m "Personal page"
   git remote add origin https://github.com/sunilmtma/sunilmtma.github.io.git
   git push -u origin main
   ```
3. In the repository, open **Settings → Pages**, set *Source* to **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute or two the site is live at https://sunilmtma.github.io.

## Update it

- **New paper:** copy one `<li class="pub">…</li>` block in `index.html`, edit it, and keep the list newest first.
- **News item:** add a `<li>` at the top of the News list.
- Then `git add . && git commit -m "Update" && git push`.

Preview locally by opening `index.html` in a browser.

The hero figure opens on a chosen stage when the address ends in `?stage=1` to `?stage=4`, for example https://sunilmtma.github.io/?stage=4.
