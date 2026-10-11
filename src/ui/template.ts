import { DIFFICULTIES } from '../engine/ai/search';
import { SETUPS } from '../engine/setup';
import { SIZE } from '../engine/types';

const levelButtons = (cls: string) =>
  Array.from({ length: SIZE }, (_, i) => SIZE - i)
    .map((l) => `<button type="button" class="${cls}" data-level="${l}" aria-label="Livello ${l}">${l}<span class="dot"></span></button>`)
    .join('');

/** Struttura HTML dell'applicazione. */
export const APP_TEMPLATE = /* html */ `
<header class="topbar">
  <div class="brand"><span class="logo">♞</span><h1>Scacchi 3D</h1></div>
  <div class="status" id="status" role="status" aria-live="polite"></div>
  <div class="top-actions">
    <button type="button" class="icon-btn" id="btn-undo" title="Annulla (Ctrl+Z)" aria-label="Annulla">↶</button>
    <button type="button" class="icon-btn" id="btn-redo" title="Ripeti (Ctrl+Y)" aria-label="Ripeti">↷</button>
    <button type="button" class="btn primary" id="btn-new">Nuova partita</button>
    <button type="button" class="icon-btn panel-toggle" id="btn-panel" aria-label="Mostra pannello" aria-expanded="true">☰</button>
  </div>
</header>

<main class="layout">
  <section class="viewport" id="viewport">
    <div class="overlay top-left">
      <div class="pill" id="mode-pill"></div>
      <div class="pill thinking" id="thinking" hidden><span class="spinner"></span><span>Il computer sta pensando…</span></div>
    </div>
    <nav class="level-rail" aria-label="Scelta rapida del livello">
      <button type="button" class="rail-all" data-level="all" title="Mostra tutti i livelli">Tutti</button>
      ${levelButtons('rail-level')}
    </nav>
    <div class="hint" id="hint">Trascina per ruotare · rotella o pizzico per lo zoom · tasto destro o due dita per spostare</div>
    <div class="banner" id="banner" hidden>
      <div class="banner-card">
        <div class="banner-title" id="banner-title"></div>
        <div class="banner-sub" id="banner-sub"></div>
        <div class="banner-actions">
          <button type="button" class="btn" id="banner-review">Rivedi la posizione</button>
          <button type="button" class="btn primary" id="banner-new">Nuova partita</button>
        </div>
      </div>
    </div>
  </section>

  <aside class="panel" id="panel">
    <section class="card">
      <h2>Livelli</h2>
      <div class="segmented" role="radiogroup" aria-label="Filtro livelli">
        <button type="button" role="radio" data-mode="all">Tutti</button>
        <button type="button" role="radio" data-mode="single">Uno</button>
        <button type="button" role="radio" data-mode="range">Intervallo</button>
      </div>
      <div class="filter-single" id="filter-single">
        <div class="level-grid">${levelButtons('grid-level')}</div>
      </div>
      <div class="filter-range" id="filter-range">
        <label>Da <select id="range-from"></select></label>
        <label>a <select id="range-to"></select></label>
      </div>
      <label class="check"><input type="checkbox" id="dim-others" checked /> Attenua i livelli non selezionati (altrimenti nascondili)</label>
      <p class="muted small">↑ / ↓ spostano la selezione di un livello. Il punto indica i livelli con mosse disponibili per il pezzo selezionato.</p>
    </section>

    <section class="card">
      <h2>Vista</h2>
      <label class="check"><input type="checkbox" id="show-labels" /> Coordinate sulle celle</label>
      <label class="check"><input type="checkbox" id="show-axes" checked /> Indicatori degli assi</label>
      <div class="row">
        <button type="button" class="btn" id="btn-camera">Centra la vista</button>
        <button type="button" class="btn" id="btn-flip">Ruota lato</button>
      </div>
    </section>

    <section class="card moves-card">
      <div class="card-head">
        <h2>Mosse</h2>
        <span class="muted small" id="ai-info"></span>
      </div>
      <div class="captured" id="captured"></div>
      <ol class="moves" id="moves"></ol>
    </section>

    <section class="card legend">
      <h2>Legenda</h2>
      <ul>
        <li><span class="swatch quiet"></span>Mossa libera</li>
        <li><span class="swatch capture"></span>Cattura</li>
        <li><span class="swatch selected"></span>Pezzo selezionato</li>
        <li><span class="swatch check"></span>Re sotto scacco</li>
        <li><span class="swatch last"></span>Ultima mossa</li>
      </ul>
    </section>
  </aside>
</main>

<dialog id="dlg-new" class="dialog">
  <form method="dialog" id="form-new">
    <h2>Nuova partita</h2>
    <fieldset>
      <legend>Modalità</legend>
      <label class="radio"><input type="radio" name="mode" value="local" /> Due giocatori sullo stesso dispositivo</label>
      <label class="radio"><input type="radio" name="mode" value="ai" checked /> Contro il computer</label>
    </fieldset>
    <fieldset class="ai-only">
      <legend>Giochi con</legend>
      <label class="radio"><input type="radio" name="color" value="1" checked /> Bianco</label>
      <label class="radio"><input type="radio" name="color" value="-1" /> Nero</label>
    </fieldset>
    <fieldset class="ai-only">
      <legend>Difficoltà</legend>
      ${DIFFICULTIES.map((d, i) => `<label class="radio"><input type="radio" name="difficulty" value="${d.id}" ${i === 1 ? 'checked' : ''} /> ${d.label} <span class="muted small">(profondità ${d.options.maxDepth})</span></label>`).join('')}
    </fieldset>
    <fieldset>
      <legend>Schieramento</legend>
      <select name="setup">
        ${SETUPS.map((s) => `<option value="${s.id}">${s.name} — ${s.description}</option>`).join('')}
      </select>
    </fieldset>
    <div class="dialog-actions">
      <button type="button" class="btn" value="cancel" id="new-cancel">Annulla</button>
      <button type="submit" class="btn primary" value="ok">Inizia</button>
    </div>
  </form>
</dialog>

<dialog id="dlg-promo" class="dialog">
  <h2>Promozione</h2>
  <p class="muted">Scegli il pezzo in cui trasformare il pedone.</p>
  <div class="promo-choices" id="promo-choices"></div>
</dialog>
`;
