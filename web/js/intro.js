import { t } from './i18n.js';

export class IntroGate {
  constructor(onEnter) {
    this.root = document.querySelector('#boot');
    this.button = document.querySelector('#btnEnter');
    this.background = [...document.body.children].filter(el => el !== this.root && el.tagName !== 'SCRIPT');
    this.background.forEach(el => { el.inert = true; });
    this.root.tabIndex = -1;
    this.root.focus();
    this.button.addEventListener('click', () => {
      if (this.button.disabled || this.entered) return;
      this.entered = true;
      this.background.forEach(el => { el.inert = false; });
      this.root.hidden = true;
      onEnter();
      document.querySelector('#btnPlay')?.focus();
    });
  }
  ready() {
    this.button.disabled = false;
    const detail = document.querySelector('#loadDetail');
    if (detail) detail.hidden = true;
    document.querySelector('#introHint').textContent = t('intro.ready');
    document.querySelector('#introHint').dataset.i18n = 'intro.ready';
  }
}
