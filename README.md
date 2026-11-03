# sunilmtma.github.io

Personal research page of Sunil Choudhary. Live at **https://sunilmtma.github.io**.

Plain HTML and CSS, no build step and no JavaScript: GitHub Pages serves the files as they are.

```
index.html                 home page: photo, short bio, links, buttons to the other pages
research/index.html        thesis and projects
publications/index.html    papers, newest first
teaching/index.html        courses and supervision
activities/index.html      reviewing, talks and visits, fellowships and awards
news/index.html            dated news items
assets/css/style.css       all styling (colours at the top)
assets/img/photo.jpg       portrait
.nojekyll                  tells GitHub Pages not to run Jekyll
```

## Update it

- **New paper:** copy one `<li>` block in `publications/index.html` and edit it.
- **News item:** add a `<tr>` row at the top of the table in `news/index.html`.
- **New page:** copy one of the folders, rename it, and add it to the menu in every page and to the buttons on the home page.
- Then `git add . && git commit -m "Update" && git push`. The site updates within a minute or two.

Preview locally by opening `index.html` in a browser.
