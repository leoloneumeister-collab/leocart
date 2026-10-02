# LeoCart Apps

Three small apps and a hub page that lists them. Plain HTML, CSS and JavaScript modules, no build step, no accounts, no backend. Everything a person enters stays in their own browser.

| App | What it does | Idea it follows |
|---|---|---|
| [Pushwake](pushwake/) | Alarm that only stops after N pushups, counted by the phone camera | Early, the pushup alarm |
| [BiteLog](bitelog/) | Calorie and macro tracker with a computed daily goal, 130+ foods, barcode lookup, 14 day chart | Cal AI and its local-market copies |
| [Voicepad](voicepad/) | Talk, get tidy notes. Removes fillers, adds punctuation, makes bullets and to-dos | Audiopen |

See [IDEAS.md](IDEAS.md) for where these ideas come from, what was copied, what was left out and why.

## Share it

- The hub (`/apps/`) has a **Share** button per app. It opens a sheet with a QR code, copy link, WhatsApp, text message, email and the phone's own share menu.
- On a phone, "Add to Home Screen" gives each app its own icon. They are installable web apps and open offline once visited.

## Run it locally

```
npm install
npx vite            # then open http://localhost:5173/apps/
```

Any static file server works, for example `npx serve .` from the repo root. Camera and microphone need `https://` or `localhost`.

## Tests

```
npm run test:apps        # unit tests: rep counter, alarm maths, calorie maths, food table, text cleanup (fast, no browser)
npm run test:apps:e2e    # Chromium tests with a fake pushup video and a fake speech engine; screenshots go to test-output/apps
```

The e2e run needs Playwright's Chromium. It serves the repo itself, so nothing else has to be running.

## Deploy

`.github/workflows/deploy.yml` copies this folder to `/apps/` on the same GitHub Pages site as the game. Merge to `main` and the live URL is `https://<user>.github.io/<repo>/apps/`. Paths are all relative, so sub-path hosting works. Any other static host (Netlify, Vercel, Cloudflare Pages) also works by serving the `apps` folder as the site root.

## Layout

```
apps/
  index.html          hub
  sw.js               offline cache, one worker for all apps
  shared/             base.css, share sheet + QR, storage wrapper, vendored QR library
  pushwake/           counter.js (brightness -> reps), alarm.js (scheduling), sound.js (Web Audio)
  bitelog/            calc.js (goal, macros, search, barcode parsing), foods.js (the table)
  voicepad/           clean.js (the text rules)
  icons/              SVG sources and PNG sizes (npm run icons rebuilds the PNGs)
```

## Known limits

- **Pushwake is a web page.** A locked phone, a closed tab or Silent mode on iPhone stops the alarm. Keep a normal alarm as backup. Camera counting works from average brightness, so it needs some light and a phone lying face up under your chest. It has not been tried on a real phone yet, only on a synthetic video. Reps faster than about one a second are missed on purpose, to ignore flicker.
- **BiteLog has no photo recognition.** That needs a paid AI model and a server to hold the key. Food values are typical averages. Barcode lookup calls Open Food Facts and has been tested against a mock only.
- **Voicepad uses the browser's speech service.** Chrome sends the audio to Google. Firefox has no speech recognition. The cleanup is plain rules, not AI.
