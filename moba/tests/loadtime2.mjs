import { startServer, launch } from './lib.mjs';
const stop = await startServer({ port: 5175 });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5175/');
await page.waitForSelector('#start-btn');
const r = await page.evaluate(async () => {
  const t0 = performance.now();
  document.getElementById('start-btn').click();
  const tCtor = performance.now() - t0; // constructor runs synchronously inside the click handler
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const frames2 = performance.now() - t0;
  return { ctorMs: Math.round(tCtor), twoFramesMs: Math.round(frames2), simTime: window.__game.world.time };
});
console.log(r);
await browser.close();
stop();
