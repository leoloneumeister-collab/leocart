# LeoCart: CV description

**LeoCart** | 3D browser kart racer | JavaScript, Three.js, WebGL, Web Audio, Vite | [Live demo](https://leoloneumeister-collab.github.io/leocart/) · [Source](https://github.com/leoloneumeister-collab/leocart)

- Built a complete 3D kart racing game from scratch in plain JavaScript and Three.js: arcade drift physics with mini-turbo boosts, six characters with trade-off stats, three themed tracks, eight position-weighted items, five AI opponents with racing lines and rubber banding, and a three-race cup, all running in the browser with keyboard and gamepad support.
- Generated every asset in code, with no image, model or audio files: procedural low-poly models, canvas textures and skies, GPU particles, and a Web Audio synthesiser and pattern sequencer that plays original music for each track, keeping the production build under 200 KB gzipped at about 110 draw calls per frame.
- Engineered it for correctness and delivery: a Playwright suite that plays full races and a whole cup through the UI and fails on any console error, offline audio rendering checks, a balance simulator for tuning, and a GitHub Actions pipeline that deploys to GitHub Pages.
