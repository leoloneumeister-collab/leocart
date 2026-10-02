// Makes each app installable and usable offline. One worker at /apps/sw.js covers the hub and every app.
// `path` is where sw.js is relative to the page that calls this ('./sw.js' from the hub, '../sw.js' from an app).
export function registerOffline(path = '../sw.js') {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register(path).catch(() => { /* offline support is a bonus */ });
}
