import { ArenaStore, emptySave } from './storage.js';
import { validateCheckpoint } from './checkpoint.js';
import { newGame, placePrediction, settlePrediction } from './game.js';
import { ac } from './arena-copy.js';

const $ = id => document.getElementById(id);
export class ProgressPanel {
  constructor(command, modeChange) {
    const stats = document.querySelector('.survival-stats');
    stats.dataset.liveOnly = ''; document.querySelector('.stage-hud').after(stats);
    $('brainCard').after(document.querySelector('.progress-card'));
    this.command = command; this.modeChange = modeChange; this.mode = 'lab'; this.data = emptySave();
    try { this.store = new ArenaStore(localStorage); this.data = this.store.load(); }
    catch (e) { this.loadError = e; }
    if (this.data.game.pending) this.mode = 'game';
    $('sessionMode').value = this.mode;
    $('sessionMode').onchange = e => { this.mode = e.target.value; this.modeChange(); this.paint(); };
    $('btnPretrained').onclick = () => { if (confirm(ac('confirmReplace'))) this.command('pretrained'); };
    $('btnClearStats').onclick = () => { if (confirm(ac('confirmStats'))) this.command('stats'); };
    $('btnExport').onclick = () => {
      if (!this.unsavedCheckpoint && !this.data.checkpoint) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(this.unsavedCheckpoint || this.data.checkpoint)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'fly-learning.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('importFile').onchange = async e => {
      try {
        const file = e.target.files[0];
        if (!file || !confirm(ac('confirmReplace'))) return;
        if (file.size > 150000) throw new Error('Backup exceeds 150 KB');
        const checkpoint = validateCheckpoint(JSON.parse(await file.text()));
        await this.command('import', { checkpoint });
      } catch (error) { this.error(error); }
      finally { e.target.value = ''; }
    };
    $('btnBet').onclick = async () => {
      if (this.busy || this.data.game.pending || !this.data.checkpoint) return;
      this.lock(true);
      try {
        const game = placePrediction(this.data.game, { id: crypto.randomUUID(), seed: crypto.getRandomValues(new Uint32Array(1))[0],
          stake: Number($('stake').value), escape: $('prediction').value === 'escape', checkpoint: this.data.checkpoint,
          approach: Number($('throwTime').value), roam: Number($('roamTime').value) });
        await this.save({ ...this.data, game });
        this.lock(false);
        await this.command('game');
      } catch (error) {
        if (error.message === 'Invalid prediction') $('gameResult').textContent = '10–100 points / pontos / puntos';
        else this.error(error);
        this.lock(false);
      }
    };
    $('btnPoints').onclick = async () => {
      if (this.busy || this.data.game.pending || !confirm(ac('confirmPoints'))) return;
      this.lock(true);
      try { await this.save({ ...this.data, game: newGame() }); }
      catch (error) { this.error(error); }
      finally { this.lock(false); }
    };
    this.paint();
    if (this.loadError) this.error(this.loadError);
  }
  async save(next) {
    if (this.loadError) throw this.loadError;
    $('saveStatus').textContent = ac('saving');
    this.data = await this.store.save(next);
    this.saveFailed = false; $('saveStatus').textContent = ac('saved');
    this.paint();
  }
  async accept(result, type) {
    this.unsavedCheckpoint = result.checkpoint;
    let next = { ...this.data, checkpoint: result.checkpoint };
    if (type === 'game') next = { ...this.data, game: { ...this.data.game,
      pending: { ...this.data.game.pending, outcome: result.episode.ok } } };
    await this.save(next);
    this.unsavedCheckpoint = null;
  }
  async settle(ok) {
    const pending = this.data.game.pending;
    if (!pending || this.settling) return;
    this.settling = true;
    try { await this.save({ ...this.data, game: settlePrediction(this.data.game, pending.id, ok) }); }
    catch (e) { this.error(e); }
    finally { this.settling = false; this.paint(); }
  }
  error(e) { this.saveFailed = true; $('saveStatus').textContent = `${ac('error')} ${e.message}`; }
  lock(busy) { this.busy = busy; this.paint(); }
  paint() {
    for (const el of document.querySelectorAll('[data-ac]')) el.textContent = ac(el.dataset.ac);
    const game = this.mode === 'game', pending = !!this.data.game.pending;
    if (game) $('learning').checked = false;
    $('gameControls').hidden = !game;
    $('gameStatsNote').hidden = !game;
    $('saveStatus').textContent ||= ac(this.data.checkpoint ? 'saved' : 'fresh');
    $('btnNew').textContent = ac('erase');
    $('pointsBalance').textContent = `${this.data.game.balance.toLocaleString()} ${ac('points')}`;
    const last = this.data.game.history.at(-1);
    $('gameResult').textContent = pending ? ac('pending') : last ? `${ac(last.won ? 'win' : 'loss')} · ${last.won ? '+' : '−'}${last.stake}` : ac('ready');
    $('gameHistory').textContent = this.data.game.history.slice(-8).map(r => `${r.won ? '+' : '−'}${r.stake}`).join(' · ');
    for (const id of ['sessionMode', 'experiment', 'throwTime', 'roamTime', 'btnPoints', 'stake', 'prediction']) $(id).disabled = this.busy || pending;
    for (const id of ['btnPretrained', 'btnClearStats', 'btnNew', 'btnTrain', 'learning', 'importFile']) $(id).disabled = this.busy || game;
    $('btnBet').disabled = this.busy || pending || !this.data.checkpoint || this.data.game.balance < 10 || this.saveFailed;
    $('btnExport').disabled = !this.data.checkpoint && !this.unsavedCheckpoint;
    $('autoNext').disabled = game;
  }
}
