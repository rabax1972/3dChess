import { DIFFICULTIES, type Difficulty } from '../engine/ai/search';
import { Game, type PlayedMove } from '../engine/game';
import { FLAG_CASTLE, FLAG_EP, moveFlag, moveFrom, movePromo, moveTo, type Move } from '../engine/move';
import { PIECE_NAMES } from '../engine/notation';
import { DEFAULT_SETUP, SETUPS, type SetupDefinition } from '../engine/setup';
import { BLACK, PROMOTION_PIECES, SIZE, WHITE, levelOf, type Color, type GameStatus, type PieceType } from '../engine/types';
import { BoardView, type MoveAnimation, type MoveTarget } from '../render/boardView';
import { AiClient } from './aiClient';
import { DEFAULT_FILTER, isLevelSelected, levelVisibility, shiftFilter, type LevelFilter, type LevelMode } from './levelFilter';
import { APP_TEMPLATE } from './template';

type Mode = { kind: 'local' } | { kind: 'ai'; human: Color; difficulty: Difficulty };

const GLYPHS: Record<'w' | 'b', Record<PieceType, string>> = {
  w: { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔' },
  b: { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' },
};
const MATERIAL = [0, 1, 3, 3, 5, 9, 0];
const colorName = (c: Color) => (c === WHITE ? 'Bianco' : 'Nero');

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento mancante: ${sel}`);
  return el;
};

/**
 * Controller dell'applicazione: collega motore (Game), vista 3D (BoardView),
 * IA (AiClient) e pannelli HTML. Tutta la logica delle regole resta nel motore.
 */
export class App {
  private game = new Game(DEFAULT_SETUP);
  private view: BoardView;
  private ai = new AiClient();
  private mode: Mode = { kind: 'local' };
  private filter: LevelFilter = { ...DEFAULT_FILTER };
  private selected: number | null = null;
  private selectedMoves: Move[] = [];
  private animating = false;
  private thinking = false;
  private reviewing = false;
  private orientation: Color = WHITE;

  constructor(root: HTMLElement) {
    root.innerHTML = APP_TEMPLATE;
    this.view = new BoardView($('#viewport'));
    this.view.onCellClick = (s) => this.onCellClick(s);
    this.view.isInteractive = (s) => this.isInteractive(s);
    this.bindControls();
    this.view.setBoard(this.game.pos.board);
    this.view.setAxesVisible(true);
    this.applyFilter();
    this.refresh();
    // All'avvio si sceglie subito modalità e difficoltà; "Annulla" lascia la partita a due giocatori.
    this.openNewGameDialog();
  }

  // ------------------------------------------------------------------ input sulla scacchiera

  private get inputLocked(): boolean {
    if (this.animating || this.thinking) return true;
    if (this.game.status().state !== 'ongoing') return true;
    return this.mode.kind === 'ai' && this.game.turn !== this.mode.human;
  }

  private isInteractive(s: number): boolean {
    if (this.inputLocked) return false;
    if (this.selectedMoves.some((m) => moveTo(m) === s)) return true;
    return this.game.pos.board[s] * this.game.turn > 0;
  }

  private onCellClick(s: number) {
    if (this.inputLocked) return;
    const toTarget = this.selectedMoves.filter((m) => moveTo(m) === s);
    if (toTarget.length) {
      void this.chooseAndPlay(toTarget);
      return;
    }
    if (this.game.pos.board[s] * this.game.turn > 0 && s !== this.selected) this.select(s);
    else this.deselect();
  }

  private select(s: number) {
    this.selected = s;
    this.selectedMoves = this.game.legalMovesFrom(s);
    const board = this.game.pos.board;
    const targets = new Map<number, MoveTarget>();
    for (const m of this.selectedMoves) {
      const to = moveTo(m);
      targets.set(to, { square: to, capture: board[to] !== 0 || moveFlag(m) === FLAG_EP });
    }
    this.view.setSelection(s, [...targets.values()]);
    this.refreshLevelIndicators();
    this.refreshStatus();
  }

  private deselect() {
    this.selected = null;
    this.selectedMoves = [];
    this.view.setSelection(null, []);
    this.refreshLevelIndicators();
    this.refreshStatus();
  }

  /** Se più mosse portano alla stessa cella si tratta di una promozione: chiede il pezzo. */
  private async chooseAndPlay(moves: Move[]) {
    let move = moves[0];
    if (moves.length > 1) {
      const promo = await this.askPromotion(this.game.turn);
      if (promo === null) return;
      move = moves.find((m) => movePromo(m) === promo) ?? moves[0];
    }
    await this.perform(move);
    this.maybeAiTurn();
  }

  /** Gioca e anima una mossa (umana, del computer o rigiocata con "ripeti"). */
  private async perform(move: Move, apply: () => PlayedMove = () => this.game.play(move)) {
    const before = this.game.pos.board;
    const anim: MoveAnimation = { from: moveFrom(move), to: moveTo(move), capturedSquare: -1 };
    if (moveFlag(move) === FLAG_CASTLE) {
      const dir = anim.to > anim.from ? 1 : -1;
      let r = anim.to + dir;
      while (before[r] === 0) r += dir;
      anim.rookFrom = r;
      anim.rookTo = anim.from + dir;
    }
    const rec = apply();
    anim.capturedSquare = rec.capturedSquare;
    this.selected = null;
    this.selectedMoves = [];
    this.view.setSelection(null, []);
    this.animating = true;
    this.refreshButtons();
    await this.view.animateMove(anim, this.game.pos.board);
    this.animating = false;
    this.refresh();
  }

  private async maybeAiTurn() {
    if (this.mode.kind !== 'ai' || this.game.turn === this.mode.human) return;
    if (this.game.status().state !== 'ongoing') return;
    this.thinking = true;
    this.refresh();
    const res = await this.ai.think(this.game.pos, this.mode.difficulty.options);
    if (!res) return; // annullata (annulla / nuova partita)
    this.thinking = false;
    if (res.move === null) {
      this.refresh();
      return;
    }
    $('#ai-info').textContent = `IA: profondità ${res.depth} · ${(res.nodes / 1000).toFixed(0)}k nodi · ${(res.timeMs / 1000).toFixed(1)} s`;
    await this.perform(res.move);
  }

  // ------------------------------------------------------------------ annulla / ripeti / nuova partita

  private undo() {
    if (this.animating) return;
    const wasThinking = this.thinking;
    this.ai.cancel();
    this.thinking = false;
    if (!this.game.canUndo()) return this.refresh();
    if (this.mode.kind === 'ai') {
      // Torna all'ultima posizione in cui toccava all'umano.
      if (!wasThinking || this.game.turn === this.mode.human) this.game.undo();
      while (this.game.canUndo() && this.game.turn !== this.mode.human) this.game.undo();
    } else this.game.undo();
    this.afterJump();
    this.maybeAiTurn();
  }

  private async redo() {
    if (this.animating || this.thinking || !this.game.canRedo()) return;
    const replay = async () => {
      const m = this.game.peekRedo();
      if (m !== undefined) await this.perform(m, () => this.game.redo()!);
    };
    await replay();
    if (this.mode.kind === 'ai' && this.game.turn !== this.mode.human && this.game.canRedo()) await replay();
    this.maybeAiTurn();
  }

  private afterJump() {
    this.reviewing = false;
    this.selected = null;
    this.selectedMoves = [];
    this.view.setSelection(null, []);
    this.view.setBoard(this.game.pos.board);
    this.refresh();
  }

  private newGame(mode: Mode, setup: SetupDefinition) {
    this.ai.cancel();
    this.thinking = false;
    this.mode = mode;
    this.game.reset(setup);
    $('#ai-info').textContent = '';
    this.orientation = mode.kind === 'ai' ? mode.human : WHITE;
    this.view.resetCamera(this.orientation);
    this.afterJump();
    this.maybeAiTurn();
  }

  // ------------------------------------------------------------------ filtro livelli

  private setFilter(patch: Partial<LevelFilter>) {
    this.filter = { ...this.filter, ...patch };
    this.applyFilter();
  }

  private applyFilter() {
    this.view.setLevelVisibility(levelVisibility(this.filter));
    document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((b) => {
      const on = b.dataset.mode === this.filter.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    $('#filter-single').hidden = this.filter.mode !== 'single';
    $('#filter-range').hidden = this.filter.mode !== 'range';
    $<HTMLSelectElement>('#range-from').value = String(Math.min(this.filter.from, this.filter.to));
    $<HTMLSelectElement>('#range-to').value = String(Math.max(this.filter.from, this.filter.to));
    $<HTMLInputElement>('#dim-others').checked = this.filter.dimOthers;
    this.refreshLevelIndicators();
  }

  private refreshLevelIndicators() {
    const board = this.game.pos.board;
    const pieceCount = Array(SIZE).fill(0);
    for (let s = 0; s < board.length; s++) if (board[s]) pieceCount[levelOf(s)]++;
    const targetLevels = new Map<number, boolean>();
    for (const m of this.selectedMoves) {
      const l = levelOf(moveTo(m)) + 1;
      targetLevels.set(l, (targetLevels.get(l) ?? false) || board[moveTo(m)] !== 0);
    }
    document.querySelectorAll<HTMLButtonElement>('.rail-level, .grid-level').forEach((b) => {
      const level = Number(b.dataset.level);
      const single = this.filter.mode === 'single' && this.filter.single === level;
      b.classList.toggle('active', single);
      b.classList.toggle('in-range', this.filter.mode === 'range' && isLevelSelected(this.filter, level));
      b.classList.toggle('empty', pieceCount[level - 1] === 0);
      b.classList.toggle('has-targets', targetLevels.has(level));
      b.classList.toggle('has-captures', targetLevels.get(level) === true);
      b.title = `Livello ${level}: ${pieceCount[level - 1]} pezzi`;
    });
    $('.rail-all').classList.toggle('active', this.filter.mode === 'all');
  }

  // ------------------------------------------------------------------ pannelli

  private refresh() {
    const pos = this.game.pos;
    this.view.setChecked(pos.checkedKings());
    const last = this.game.played.at(-1);
    this.view.setLastMove(last ? [moveFrom(last.move), moveTo(last.move)] : null);
    this.refreshStatus();
    this.refreshMoves();
    this.refreshCaptured();
    this.refreshButtons();
    this.refreshLevelIndicators();
    this.refreshBanner();
    $('#thinking').hidden = !this.thinking;
    $('#mode-pill').textContent =
      this.mode.kind === 'local'
        ? `Due giocatori · ${this.game.setup.name}`
        : `Contro il computer (${this.mode.difficulty.label}) · giochi col ${colorName(this.mode.human)}`;
  }

  private statusText(st: GameStatus): string {
    const turn = this.game.turn;
    switch (st.state) {
      case 'checkmate':
        return `Scacco matto: vince il ${colorName(st.winner!)}`;
      case 'stalemate':
        return 'Stallo: patta';
      case 'draw':
        return st.reason === 'fifty-move'
          ? 'Patta per la regola delle 50 mosse'
          : st.reason === 'repetition'
            ? 'Patta per ripetizione tripla'
            : 'Patta per materiale insufficiente';
      default: {
        const checked = this.game.pos.checkedKings().length;
        if (checked) return `Scacco al ${colorName(turn)}${checked > 1 ? ` (${checked} re)` : ''}! Tocca al ${colorName(turn)}`;
        return `Tocca al ${colorName(turn)}`;
      }
    }
  }

  private refreshStatus() {
    const st = this.game.status();
    const el = $('#status');
    el.className = 'status' + (st.state !== 'ongoing' ? ' over' : st.inCheck ? ' check' : '');
    let extra = '';
    if (st.state === 'ongoing' && this.selected !== null) {
      const p = this.game.pos.board[this.selected];
      const n = new Set(this.selectedMoves.map(moveTo)).size;
      extra = ` · ${PIECE_NAMES[Math.abs(p) as PieceType]}: ${n === 0 ? 'nessuna mossa legale' : n === 1 ? '1 mossa' : `${n} mosse`}`;
    }
    el.innerHTML = `<span class="turn-dot ${this.game.turn === WHITE ? 'white' : 'black'}"></span><span></span>`;
    el.lastElementChild!.textContent = this.statusText(st) + extra;
  }

  private refreshMoves() {
    const list = $('#moves');
    const played = this.game.played;
    if (!played.length) {
      list.innerHTML = '<li class="empty">Nessuna mossa. Fai click su un pezzo per vedere le sue mosse.</li>';
      return;
    }
    const rows: string[] = [];
    // La prima mossa potrebbe essere del Nero se la posizione iniziale lo prevede.
    const offset = played[0].color === BLACK ? 1 : 0;
    const slots: (PlayedMove | null)[] = [...Array(offset).fill(null), ...played];
    for (let i = 0; i < slots.length; i += 2) {
      const cell = (pm: PlayedMove | null | undefined, idx: number) =>
        pm ? `<span class="mv${idx === slots.length - 1 ? ' last' : ''}">${escapeHtml(pm.notation)}</span>` : '<span class="mv"></span>';
      rows.push(`<li><span class="num">${i / 2 + 1}.</span>${cell(slots[i], i)}${cell(slots[i + 1], i + 1)}</li>`);
    }
    list.innerHTML = rows.join('');
    list.scrollTop = list.scrollHeight;
  }

  private refreshCaptured() {
    const byWhite: PieceType[] = [], byBlack: PieceType[] = [];
    for (const pm of this.game.played) {
      if (!pm.captured) continue;
      (pm.color === WHITE ? byWhite : byBlack).push(Math.abs(pm.captured) as PieceType);
    }
    const score = (l: PieceType[]) => l.reduce((a, t) => a + MATERIAL[t], 0);
    const diff = score(byWhite) - score(byBlack);
    const row = (l: PieceType[], glyphs: Record<PieceType, string>, adv: number) =>
      `<div class="row-cap">${l.sort((a, b) => b - a).map((t) => glyphs[t]).join('')}${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>`;
    $('#captured').innerHTML =
      byWhite.length || byBlack.length ? row(byWhite, GLYPHS.b, diff) + row(byBlack, GLYPHS.w, -diff) : '';
  }

  private refreshButtons() {
    const busy = this.animating;
    $<HTMLButtonElement>('#btn-undo').disabled = busy || !this.game.canUndo();
    $<HTMLButtonElement>('#btn-redo').disabled = busy || this.thinking || !this.game.canRedo();
  }

  private refreshBanner() {
    const st = this.game.status();
    const show = st.state !== 'ongoing' && !this.reviewing && !this.animating;
    $('#banner').hidden = !show;
    if (!show) return;
    $('#banner-title').textContent =
      st.state === 'checkmate' ? 'Scacco matto!' : st.state === 'stalemate' ? 'Stallo' : 'Patta';
    $('#banner-sub').textContent = this.statusText(st);
  }

  // ------------------------------------------------------------------ dialoghi

  private askPromotion(color: Color): Promise<PieceType | null> {
    const dlg = $<HTMLDialogElement>('#dlg-promo');
    const box = $('#promo-choices');
    const glyphs = GLYPHS[color === WHITE ? 'w' : 'b'];
    box.innerHTML = PROMOTION_PIECES.map(
      (t) => `<button type="button" data-type="${t}"><span class="glyph">${glyphs[t]}</span>${PIECE_NAMES[t]}</button>`,
    ).join('');
    return new Promise((resolve) => {
      const done = (v: PieceType | null) => {
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(v);
      };
      const onClose = () => done(null);
      dlg.addEventListener('close', onClose);
      box.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => done(Number(b.dataset.type) as PieceType)),
      );
      dlg.showModal();
      box.querySelector<HTMLButtonElement>('button')?.focus();
    });
  }

  private openNewGameDialog() {
    const dlg = $<HTMLDialogElement>('#dlg-new');
    const form = $<HTMLFormElement>('#form-new');
    const sync = () => {
      const ai = (form.elements.namedItem('mode') as RadioNodeList).value === 'ai';
      form.querySelectorAll<HTMLFieldSetElement>('.ai-only').forEach((f) => (f.disabled = !ai));
    };
    form.onchange = sync;
    (form.elements.namedItem('setup') as HTMLSelectElement).value = this.game.setup.id;
    sync();
    dlg.showModal();
  }

  private submitNewGame() {
    const form = $<HTMLFormElement>('#form-new');
    const value = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement).value;
    const setup = SETUPS.find((s) => s.id === value('setup')) ?? DEFAULT_SETUP;
    const mode: Mode =
      value('mode') === 'ai'
        ? {
            kind: 'ai',
            human: Number(value('color')) as Color,
            difficulty: DIFFICULTIES.find((d) => d.id === value('difficulty')) ?? DIFFICULTIES[1],
          }
        : { kind: 'local' };
    this.newGame(mode, setup);
  }

  // ------------------------------------------------------------------ collegamenti

  private bindControls() {
    $('#btn-undo').addEventListener('click', () => this.undo());
    $('#btn-redo').addEventListener('click', () => void this.redo());
    $('#btn-new').addEventListener('click', () => this.openNewGameDialog());
    $('#banner-new').addEventListener('click', () => this.openNewGameDialog());
    $('#banner-review').addEventListener('click', () => {
      this.reviewing = true;
      this.refreshBanner();
    });
    $('#form-new').addEventListener('submit', () => this.submitNewGame());
    $('#new-cancel').addEventListener('click', () => $<HTMLDialogElement>('#dlg-new').close());

    $('#btn-panel').addEventListener('click', () => {
      const panel = $('#panel');
      const collapsed = panel.classList.toggle('collapsed');
      $('#btn-panel').setAttribute('aria-expanded', String(!collapsed));
    });

    document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((b) =>
      b.addEventListener('click', () => this.setFilter({ mode: b.dataset.mode as LevelMode })),
    );
    const onLevelButton = (b: HTMLButtonElement, toggle: boolean) => {
      const level = Number(b.dataset.level);
      if (toggle && this.filter.mode === 'single' && this.filter.single === level) this.setFilter({ mode: 'all' });
      else this.setFilter({ mode: 'single', single: level });
    };
    document.querySelectorAll<HTMLButtonElement>('.rail-level').forEach((b) =>
      b.addEventListener('click', () => onLevelButton(b, true)),
    );
    document.querySelectorAll<HTMLButtonElement>('.grid-level').forEach((b) =>
      b.addEventListener('click', () => onLevelButton(b, false)),
    );
    $('.rail-all').addEventListener('click', () => this.setFilter({ mode: 'all' }));

    const from = $<HTMLSelectElement>('#range-from'), to = $<HTMLSelectElement>('#range-to');
    for (const sel of [from, to])
      sel.innerHTML = Array.from({ length: SIZE }, (_, i) => `<option value="${i + 1}">Livello ${i + 1}</option>`).join('');
    from.addEventListener('change', () => this.setFilter({ from: Number(from.value) }));
    to.addEventListener('change', () => this.setFilter({ to: Number(to.value) }));
    $<HTMLInputElement>('#dim-others').addEventListener('change', (e) =>
      this.setFilter({ dimOthers: (e.target as HTMLInputElement).checked }),
    );

    $<HTMLInputElement>('#show-labels').addEventListener('change', (e) =>
      this.view.setLabelsVisible((e.target as HTMLInputElement).checked),
    );
    $<HTMLInputElement>('#show-axes').addEventListener('change', (e) =>
      this.view.setAxesVisible((e.target as HTMLInputElement).checked),
    );
    $('#btn-camera').addEventListener('click', () => this.view.resetCamera(this.orientation));
    $('#btn-flip').addEventListener('click', () => {
      this.orientation = this.orientation === WHITE ? BLACK : WHITE;
      this.view.resetCamera(this.orientation);
    });

    window.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void this.redo();
      } else if (e.key === 'Escape') this.deselect();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const base = this.filter.mode === 'all'
          ? { ...this.filter, mode: 'single' as const, single: this.selected !== null ? levelOf(this.selected) + 1 : 1 }
          : this.filter;
        this.filter = this.filter.mode === 'all' ? base : shiftFilter(base, e.key === 'ArrowUp' ? 1 : -1);
        this.applyFilter();
      }
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
