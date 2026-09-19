export function bindSceneLayout(doc = document, win = window) {
  const stage = doc.querySelector('.stage'), transport = doc.querySelector('.transport');
  const dialog = doc.getElementById('sceneDialog'), size = doc.getElementById('sceneSize');
  const expand = doc.getElementById('btnSceneFull'), exit = doc.getElementById('btnSceneExit');
  let homes = [], scroll = [0, 0];
  size.addEventListener('change', () => { stage.dataset.sceneSize = size.value === 'large' ? 'large' : 'half'; });
  const restore = () => {
    if (!homes.length) return;
    for (const [node, marker] of homes) marker.replaceWith(node);
    homes = [];
    doc.body.classList.remove('scene-open');
    expand.setAttribute('aria-expanded', 'false');
    win.scrollTo(...scroll);
    expand.focus({ preventScroll: true });
  };
  expand.addEventListener('click', () => {
    if (dialog.open) return;
    scroll = [win.scrollX, win.scrollY];
    // Move the existing canvas and controls; never recreate the simulation.
    homes = [stage, transport].map(node => {
      const marker = doc.createComment('scene layout position');
      node.before(marker); dialog.append(node);
      return [node, marker];
    });
    try {
      dialog.showModal();
      doc.body.classList.add('scene-open');
      expand.setAttribute('aria-expanded', 'true');
      exit.focus({ preventScroll: true });
    } catch { restore(); }
  });
  exit.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', restore);
}
