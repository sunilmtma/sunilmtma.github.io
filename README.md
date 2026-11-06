# sunilmtma.github.io

Personal research page of Sunil Choudhary. Live at **https://sunilmtma.github.io** (English) and **https://sunilmtma.github.io/fr/** (French).

Plain HTML and CSS with no build step: GitHub Pages serves the files as they are. One small script handles the dark/light toggle.

```
index.html                 home page: photo, short bio, links, buttons to the other pages
research/index.html        thesis and projects
publications/index.html    papers, newest first
teaching/index.html        redirect to activities/#teaching (teaching now lives in Activities)
activities/index.html      teaching, supervision, committees and reviewing, talks and visits, fellowships and awards
news/index.html            dated news items
fr/                        French version, same structure (fr/index.html, fr/research/, ...)
assets/css/style.css       all styling (colours for both themes at the top)
assets/js/site.js          dark/light toggle; remembers the choice, otherwise follows the system
assets/img/profile.jpg     portrait (square crop)
.nojekyll                  tells GitHub Pages not to run Jekyll
```

## Update it

- **Every change goes in both languages:** edit the English page and its copy under `fr/`.
- **New paper:** copy one `<li>` block in `publications/index.html` (and `fr/publications/index.html`) and edit it.
- **News item:** add a `<tr>` row at the top of the table in `news/index.html` (and `fr/news/index.html`).
- **New page:** copy one of the folders in both languages, and add it to the menu in every page and to the buttons on both home pages.
- After changing the CSS or JS, bump the `?v=` number on every page so browsers load the new file.
- Then `git add . && git commit -m "Update" && git push`. The site updates within a minute or two.

Preview locally by opening `index.html` in a browser.
