# ถึงแฟนเก่าคนโปรด — "To My Favorite Ex"

One-page, mobile-first Loy Krathong invitation. Plain HTML + CSS + JavaScript, no libraries, no build step.

## Folder structure

```text
favorite-ex/
├── index.html
├── style.css
├── script.js
└── assets/
    ├── cat-krathong-smooth.gif
    ├── cat-toy-gun-smooth.gif
    └── cat-happy-smooth.gif
```

The three GIFs are already in `assets/` in this zip. If you rebuild the folder yourself, put your
GIFs there with exactly these names (do not rename them).

## Run locally

Easiest: double-click `index.html`.

Or serve it (handy for testing on your phone on the same Wi-Fi):

```bash
cd favorite-ex
python3 -m http.server 8080
# open http://localhost:8080
```

## Notes

- The Thai font (Prompt) loads from Google Fonts when online; offline it falls back to the system Thai font.
- Tuning values (timings, number of fragments, aim limits) are in the `CFG` block at the top of `script.js`.
- The muzzle position of the toy gun is the `GUN` constant in `script.js` (fractions of the GIF size).
