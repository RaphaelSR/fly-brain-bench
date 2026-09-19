export const PREFERENCES_KEY = 'fly-play-preferences-v1';
export const selectBrain = value => value === 'light' ? 'light' : 'whole';
export const selectGraphics = value => value === 'light' ? 'light' : 'standard';

export function readPreferences(storage, requestedBrain = null) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(PREFERENCES_KEY)); } catch {}
  return { brain: selectBrain(requestedBrain ?? saved?.brain), graphics: selectGraphics(saved?.graphics) };
}

export function savePreferences(storage, preferences) {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ brain: selectBrain(preferences.brain), graphics: selectGraphics(preferences.graphics) }));
    return true;
  } catch { return false; }
}

export function applyGraphics(view, brain, quality, dpr = globalThis.devicePixelRatio || 1) {
  const light = selectGraphics(quality) === 'light';
  view.renderer.setPixelRatio(Math.min(dpr, light ? 1 : 1.75));
  view.renderer.shadowMap.enabled = !light;
  view.scene.traverse(object => {
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) material.needsUpdate = true;
  });
  if (brain) brain.pixelRatioLimit = light ? 1 : 2;
}
