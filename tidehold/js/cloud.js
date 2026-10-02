// Optional cloud copy of the save. It only does anything when the page runs as a claude.ai artifact
// (the viewer provides window.claude with a per-person database). Everywhere else this is a no-op
// and the game saves to localStorage only.

const PUSH_GAP_MS = 8000;

export async function connectCloud(game, St) {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') return null;
  try {
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    const ref = db.doc(`data/users/${uid}/tidehold-save`);
    let remote = null;
    try {
      const snap = await ref.get();
      if (snap.exists && snap.data && typeof snap.data.json === 'string') remote = snap.data;
    } catch {
      return null;
    }
    // another device (or a cleared browser) may hold the newer island
    if (remote && remote.stamp > game.S.last + 3000 && game.mode === 'home') {
      const S = St.load({ getItem: () => remote.json }, game.now());
      if (S) game.adoptState(S);
    }
    const link = { busy: false, timer: 0, pending: null, lastPush: -PUSH_GAP_MS };
    const flush = () => {
      link.timer = 0;
      if (!link.pending || link.busy) return;
      const { json, stamp } = link.pending;
      link.pending = null;
      link.busy = true;
      link.lastPush = performance.now();
      Promise.resolve(ref.set({ json, stamp }))
        .catch(() => {})
        .finally(() => {
          link.busy = false;
          if (link.pending && !link.timer) link.timer = setTimeout(flush, PUSH_GAP_MS);
        });
    };
    link.push = (json, stamp) => {
      link.pending = { json, stamp };
      if (link.timer || link.busy) return;
      const wait = Math.max(0, PUSH_GAP_MS - (performance.now() - link.lastPush));
      link.timer = setTimeout(flush, wait);
    };
    link.push(St.serialize(game.S), game.now());
    return link;
  } catch {
    return null;
  }
}
