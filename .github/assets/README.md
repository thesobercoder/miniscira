# Banner

`banner.png` (2400×1200) is the README hero, and `app/opengraph-image.png`
(1200×630) is the link-preview card Next serves by file convention. Both are
screenshots of the app's real timeline components — `ChainOfThoughtStep`,
`Live`, `QueryBadges`, `ResultList` — not mockups of them, so neither can drift
from the product's actual look.

`banner-shot.page.tsx` is the page that renders it. It lives here rather than
under `app/` on purpose: it is a render target, not a route, and a permanent
`/banner-shot` URL in the app shell would be a leak.

## Regenerating

```bash
mkdir -p app/banner-shot && cp .github/assets/banner-shot.page.tsx app/banner-shot/page.tsx
```

The page sits inside the proxy's auth matcher, so add `banner-shot` to the
lookahead in `proxy.ts` for the duration, and set `DEMO_MODE=false` (in
`.env.local`, which overrides `.env`) or the proxy folds it into the landing
page. Then `bun run dev` and:

The page fills the viewport, so `--window-size` alone decides which asset you
get:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# README hero — 2400×630 via the 2× scale factor
"$CHROME" --headless --disable-gpu --hide-scrollbars --screenshot=".github/assets/banner.png" --window-size=1200,600 --force-device-scale-factor=2 --virtual-time-budget=9000 "http://localhost:3000/banner-shot"

# Link-preview card — exactly 1200×630, the size unfurlers expect
"$CHROME" --headless --disable-gpu --hide-scrollbars --screenshot="app/opengraph-image.png" --window-size=1200,630 --force-device-scale-factor=1 --virtual-time-budget=9000 "http://localhost:3000/banner-shot"
```

`--force-device-scale-factor=2` is what makes the banner 2400×1200; without it
the text is soft on high-DPI screens. The OG card stays at 1× because 1200×630
is the dimension unfurlers look for.

Then undo all three: delete `app/banner-shot`, revert the `proxy.ts` matcher,
and drop the `DEMO_MODE` override.
