import {
  BISHOP_DIRS,
  DIR_AXIS,
  DIR_COUNT,
  DIR_KIND,
  DIR_PLANAR,
  KING_TARGETS,
  KNIGHT_TARGETS,
  PAWN_CAPTURES,
  QUEEN_DIRS,
  RAYS,
  ROOK_DIRS,
} from './directions';
import {
  FLAG_CASTLE,
  FLAG_DOUBLE,
  FLAG_EP,
  FLAG_NONE,
  encodeMove,
  moveFlag,
  moveFrom,
  movePromo,
  moveTo,
  type Move,
} from './move';
import {
  BISHOP,
  BLACK,
  CELLS,
  KING,
  KNIGHT,
  PAWN,
  PLANE,
  PROMOTION_PIECES,
  QUEEN,
  ROOK,
  SIZE,
  WHITE,
  colorIndex,
  fileOf,
  levelOf,
  pawnDirection,
  promotionRank,
  rankOf,
  toIndex,
  type Color,
  type GameStatus,
  type Placement,
} from './types';
import {
  Z_EP_HI,
  Z_EP_LO,
  Z_EPV_HI,
  Z_EPV_LO,
  Z_PIECE_HI,
  Z_PIECE_LO,
  Z_SIDE_HI,
  Z_SIDE_LO,
  Z_VIRGIN_HI,
  Z_VIRGIN_LO,
  combineKey,
  pieceKey,
} from './zobrist';

/** Numero di semimosse senza catture né mosse di pedone che fa scattare la patta. */
export const FIFTY_MOVE_PLIES = 100;
export const REPETITION_LIMIT = 3;

interface Undo {
  move: Move;
  piece: number;
  captured: number;
  capSq: number;
  rookFrom: number;
  ep: number;
  epVictim: number;
  halfmove: number;
  hi: number;
  lo: number;
  virginCleared: number[];
}

export interface PositionSnapshot {
  board: number[];
  virgin: number[];
  side: Color;
  ep: number;
  /** Casella del pedone catturabile en passant (-1 se nessuno). Facoltativa per compatibilità. */
  epVictim?: number;
  halfmove: number;
  fullmove: number;
  history: number[];
}

/**
 * Stato completo di una posizione con make/unmake incrementali.
 *
 * `virgin[s]` = 1 se il pezzo in s non si è mai mosso: serve all'arrocco (re e torre)
 * e al doppio passo dei pedoni ("prima mossa"), indipendentemente dallo schieramento.
 *
 * Più re per colore sono ammessi (lo schieramento di default ne ha due): ogni re è
 * un pezzo reale, quindi nessuna mossa può lasciarne uno sotto scacco.
 */
export class Position {
  board = new Int8Array(CELLS);
  virgin = new Uint8Array(CELLS);
  side: Color = WHITE;
  /** Casella scavalcata dall'ultimo doppio passo (bersaglio dell'en passant), -1 se nessuna. */
  ep = -1;
  /** Casella del pedone che ha fatto il doppio passo e che l'en passant cattura. */
  epVictim = -1;
  halfmove = 0;
  fullmove = 1;
  hi = 0;
  lo = 0;
  /** Caselle dei re per colore (indice 0 = bianco, 1 = nero). */
  kings: [number[], number[]] = [[], []];
  /** Chiavi delle posizioni precedenti a ogni mossa, per la ripetizione. */
  history: number[] = [];
  private undoStack: Undo[] = [];
  /**
   * Lista delle caselle occupate (entrambi i colori), aggiornata in make/unmake:
   * evita di scorrere tutte le 512 celle nel generatore e nella valutazione.
   */
  readonly pieceList = new Int16Array(CELLS);
  pieceCount = 0;
  private pieceIndex = new Int16Array(CELLS).fill(-1);

  private listAdd(s: number) {
    this.pieceIndex[s] = this.pieceCount;
    this.pieceList[this.pieceCount++] = s;
  }

  private listRemove(s: number) {
    const i = this.pieceIndex[s];
    const last = this.pieceList[--this.pieceCount];
    this.pieceList[i] = last;
    this.pieceIndex[last] = i;
    this.pieceIndex[s] = -1;
  }

  private listMove(from: number, to: number) {
    const i = this.pieceIndex[from];
    this.pieceList[i] = to;
    this.pieceIndex[to] = i;
    this.pieceIndex[from] = -1;
  }

  static fromPlacements(pieces: readonly Placement[], side: Color = WHITE): Position {
    const pos = new Position();
    for (const p of pieces) {
      const s = toIndex(p.x, p.y, p.z);
      if (pos.board[s] !== 0) throw new Error(`Casella occupata due volte: ${p.x},${p.y},${p.z}`);
      pos.board[s] = p.type * p.color;
      pos.virgin[s] = p.moved ? 0 : 1;
    }
    pos.side = side;
    pos.recompute();
    return pos;
  }

  static fromSnapshot(snap: PositionSnapshot): Position {
    const pos = new Position();
    pos.board.set(snap.board);
    pos.virgin.set(snap.virgin);
    pos.side = snap.side;
    pos.ep = snap.ep;
    pos.epVictim = snap.epVictim ?? (snap.ep >= 0 ? snap.ep + (snap.side === WHITE ? -SIZE : SIZE) : -1);
    pos.halfmove = snap.halfmove;
    pos.fullmove = snap.fullmove;
    pos.history = snap.history.slice();
    pos.recompute();
    return pos;
  }

  snapshot(): PositionSnapshot {
    return {
      board: Array.from(this.board),
      virgin: Array.from(this.virgin),
      side: this.side,
      ep: this.ep,
      epVictim: this.epVictim,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      history: this.history.slice(),
    };
  }

  clone(): Position {
    return Position.fromSnapshot(this.snapshot());
  }

  /** Ricalcola hash e liste dei re da zero. */
  private recompute() {
    let hi = 0, lo = 0;
    this.kings = [[], []];
    this.pieceCount = 0;
    this.pieceIndex.fill(-1);
    for (let s = 0; s < CELLS; s++) {
      const p = this.board[s];
      if (p !== 0) {
        this.listAdd(s);
        const k = pieceKey(p, s);
        hi ^= Z_PIECE_HI[k];
        lo ^= Z_PIECE_LO[k];
        if (Math.abs(p) === KING) this.kings[p > 0 ? 0 : 1].push(s);
      }
      if (this.virgin[s]) {
        hi ^= Z_VIRGIN_HI[s];
        lo ^= Z_VIRGIN_LO[s];
      }
    }
    if (this.ep >= 0) {
      hi ^= Z_EP_HI[this.ep] ^ Z_EPV_HI[this.epVictim];
      lo ^= Z_EP_LO[this.ep] ^ Z_EPV_LO[this.epVictim];
    }
    if (this.side === BLACK) {
      hi ^= Z_SIDE_HI;
      lo ^= Z_SIDE_LO;
    }
    this.hi = hi;
    this.lo = lo;
  }

  get key(): number {
    return combineKey(this.hi, this.lo);
  }

  // ---------------------------------------------------------------- attacchi

  /** true se la casella `sq` è attaccata da un pezzo del colore `by`. */
  isAttacked(sq: number, by: Color): boolean {
    const b = this.board;
    // Pedoni: le caselle da cui un pedone di `by` cattura sq sono le "catture" all'indietro.
    const pawn = PAWN * by;
    const pawnSources = PAWN_CAPTURES[colorIndex((-by) as Color)][sq];
    for (let i = 0; i < pawnSources.length; i++) if (b[pawnSources[i]] === pawn) return true;
    const knight = KNIGHT * by;
    const kn = KNIGHT_TARGETS[sq];
    for (let i = 0; i < kn.length; i++) if (b[kn[i]] === knight) return true;
    const king = KING * by;
    const kg = KING_TARGETS[sq];
    for (let i = 0; i < kg.length; i++) if (b[kg[i]] === king) return true;
    const base = sq * DIR_COUNT;
    for (let d = 0; d < DIR_COUNT; d++) {
      const ray = RAYS[base + d];
      for (let i = 0; i < ray.length; i++) {
        const p = b[ray[i]];
        if (p === 0) continue;
        if (p * by > 0) {
          const t = p * by;
          if (t === QUEEN || (t === ROOK && DIR_KIND[d] === DIR_AXIS) || (t === BISHOP && DIR_KIND[d] === DIR_PLANAR))
            return true;
        }
        break;
      }
    }
    return false;
  }

  /** Re del colore `c` attualmente sotto scacco. */
  checkedKings(c: Color = this.side): number[] {
    return this.kings[colorIndex(c)].filter((k) => this.isAttacked(k, (-c) as Color));
  }

  inCheck(c: Color = this.side): boolean {
    const ks = this.kings[colorIndex(c)];
    for (let i = 0; i < ks.length; i++) if (this.isAttacked(ks[i], (-c) as Color)) return true;
    return false;
  }

  // ---------------------------------------------------------------- generazione

  /**
   * Mosse pseudo-legali (possono lasciare il re sotto scacco).
   * Con `capturesOnly` genera solo catture e promozioni (per la quiescenza dell'IA).
   */
  generatePseudo(out: Move[] = [], capturesOnly = false): Move[] {
    const b = this.board;
    const us = this.side;
    const list = this.pieceList;
    for (let i = 0; i < this.pieceCount; i++) {
      const s = list[i];
      const p = b[s] * us;
      if (p <= 0) continue;
      switch (p) {
        case PAWN:
          this.genPawn(s, out, capturesOnly);
          break;
        case KNIGHT:
          this.genLeaper(s, KNIGHT_TARGETS[s], out, capturesOnly);
          break;
        case KING:
          this.genLeaper(s, KING_TARGETS[s], out, capturesOnly);
          if (!capturesOnly && this.virgin[s]) this.genCastles(s, out);
          break;
        case BISHOP:
          this.genSlider(s, BISHOP_DIRS, out, capturesOnly);
          break;
        case ROOK:
          this.genSlider(s, ROOK_DIRS, out, capturesOnly);
          break;
        case QUEEN:
          this.genSlider(s, QUEEN_DIRS, out, capturesOnly);
          break;
      }
    }
    return out;
  }

  private addPawnMove(from: number, to: number, out: Move[], flag = FLAG_NONE) {
    if (rankOf(to) === promotionRank(this.side)) {
      for (const pr of PROMOTION_PIECES) out.push(encodeMove(from, to, pr, flag));
    } else out.push(encodeMove(from, to, 0, flag));
  }

  private genPawn(s: number, out: Move[], capturesOnly: boolean) {
    const b = this.board;
    const us = this.side;
    const step = pawnDirection(us) * SIZE;
    const ny = rankOf(s) + pawnDirection(us);
    if (ny >= 0 && ny < SIZE) {
      const one = s + step;
      const promoting = ny === promotionRank(us);
      if (b[one] === 0 && (!capturesOnly || promoting)) {
        this.addPawnMove(s, one, out);
        const ny2 = ny + pawnDirection(us);
        if (!capturesOnly && this.virgin[s] && ny2 >= 0 && ny2 < SIZE && b[one + step] === 0)
          out.push(encodeMove(s, one + step, 0, FLAG_DOUBLE));
      }
    }
    // Passo verticale: un livello su o giù se libero, due alla prima mossa se il percorso è libero.
    if (!capturesOnly) {
      const z = levelOf(s);
      for (const dz of [-1, 1]) {
        const z1 = z + dz;
        if (z1 < 0 || z1 >= SIZE) continue;
        const one = s + dz * PLANE;
        if (b[one] !== 0) continue;
        out.push(encodeMove(s, one));
        const z2 = z1 + dz;
        if (this.virgin[s] && z2 >= 0 && z2 < SIZE && b[one + dz * PLANE] === 0)
          out.push(encodeMove(s, one + dz * PLANE, 0, FLAG_DOUBLE));
      }
    }
    const caps = PAWN_CAPTURES[colorIndex(us)][s];
    for (let i = 0; i < caps.length; i++) {
      const t = caps[i];
      if (b[t] * us < 0) this.addPawnMove(s, t, out);
      else if (t === this.ep) out.push(encodeMove(s, t, 0, FLAG_EP));
    }
  }

  private genLeaper(s: number, targets: Int16Array, out: Move[], capturesOnly: boolean) {
    const b = this.board;
    const us = this.side;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const q = b[t] * us;
      if (q < 0 || (q === 0 && !capturesOnly)) out.push(encodeMove(s, t));
    }
  }

  private genSlider(s: number, dirs: readonly number[], out: Move[], capturesOnly: boolean) {
    const b = this.board;
    const us = this.side;
    const base = s * DIR_COUNT;
    for (let di = 0; di < dirs.length; di++) {
      const ray = RAYS[base + dirs[di]];
      for (let i = 0; i < ray.length; i++) {
        const t = ray[i];
        const q = b[t] * us;
        if (q === 0) {
          if (!capturesOnly) out.push(encodeMove(s, t));
          continue;
        }
        if (q < 0) out.push(encodeMove(s, t));
        break;
      }
    }
  }

  /**
   * Arrocco sul piano del re (stesso livello, stessa traversa), lungo l'asse x:
   * re e torre mai mossi, caselle intermedie libere, re non sotto scacco e non
   * attraversa caselle attaccate. Il re si sposta di 2 verso la torre, la torre
   * scavalca il re e si posa sulla casella attraversata.
   */
  private genCastles(s: number, out: Move[]) {
    const b = this.board;
    const us = this.side;
    const them = (-us) as Color;
    const x = fileOf(s), y = rankOf(s), z = levelOf(s);
    let checked: boolean | undefined;
    for (const dir of [-1, 1]) {
      let rook = -1;
      for (let k = 1; ; k++) {
        const nx = x + dir * k;
        if (nx < 0 || nx >= SIZE) break;
        const t = toIndex(nx, y, z);
        if (b[t] === 0) continue;
        if (b[t] === ROOK * us && this.virgin[t] && k >= 3) rook = t;
        break;
      }
      if (rook < 0) continue;
      checked ??= this.isAttacked(s, them);
      if (checked) return;
      const pass = toIndex(x + dir, y, z), dest = toIndex(x + 2 * dir, y, z);
      if (this.isAttacked(pass, them) || this.isAttacked(dest, them)) continue;
      out.push(encodeMove(s, dest, 0, FLAG_CASTLE));
    }
  }

  /** Mosse legali per il giocatore di turno. */
  legalMoves(): Move[] {
    const pseudo = this.generatePseudo();
    const legal: Move[] = [];
    const us = this.side;
    for (const m of pseudo) {
      this.makeMove(m);
      if (!this.inCheck(us)) legal.push(m);
      this.unmakeMove();
    }
    return legal;
  }

  hasLegalMove(): boolean {
    const us = this.side;
    for (const m of this.generatePseudo()) {
      this.makeMove(m);
      const ok = !this.inCheck(us);
      this.unmakeMove();
      if (ok) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- make / unmake

  private xorPiece(p: number, s: number) {
    const k = pieceKey(p, s);
    this.hi ^= Z_PIECE_HI[k];
    this.lo ^= Z_PIECE_LO[k];
  }

  private clearVirgin(s: number, cleared: number[]) {
    if (!this.virgin[s]) return;
    this.virgin[s] = 0;
    this.hi ^= Z_VIRGIN_HI[s];
    this.lo ^= Z_VIRGIN_LO[s];
    cleared.push(s);
  }

  private moveKing(color: Color, from: number, to: number) {
    const ks = this.kings[colorIndex(color)];
    ks[ks.indexOf(from)] = to;
  }

  makeMove(m: Move) {
    const b = this.board;
    const from = moveFrom(m), to = moveTo(m), promo = movePromo(m), flag = moveFlag(m);
    const piece = b[from];
    const us = this.side;
    const rec: Undo = {
      move: m,
      piece,
      captured: 0,
      capSq: -1,
      rookFrom: -1,
      ep: this.ep,
      epVictim: this.epVictim,
      halfmove: this.halfmove,
      hi: this.hi,
      lo: this.lo,
      virginCleared: [],
    };
    this.history.push(this.key);

    const epVictim = this.epVictim;
    if (this.ep >= 0) {
      this.hi ^= Z_EP_HI[this.ep] ^ Z_EPV_HI[this.epVictim];
      this.lo ^= Z_EP_LO[this.ep] ^ Z_EPV_LO[this.epVictim];
      this.ep = -1;
      this.epVictim = -1;
    }

    const capSq = flag === FLAG_EP ? epVictim : b[to] !== 0 ? to : -1;
    if (capSq >= 0) {
      rec.captured = b[capSq];
      rec.capSq = capSq;
      this.xorPiece(b[capSq], capSq);
      b[capSq] = 0;
      this.listRemove(capSq);
      this.clearVirgin(capSq, rec.virginCleared);
      if (Math.abs(rec.captured) === KING) {
        const ks = this.kings[rec.captured > 0 ? 0 : 1];
        ks.splice(ks.indexOf(capSq), 1);
      }
    }

    this.clearVirgin(from, rec.virginCleared);
    this.xorPiece(piece, from);
    b[from] = 0;
    this.listMove(from, to);
    const placed = promo ? promo * us : piece;
    b[to] = placed;
    this.xorPiece(placed, to);

    if (Math.abs(piece) === KING) this.moveKing(us, from, to);

    if (flag === FLAG_CASTLE) {
      const dir = to > from ? 1 : -1;
      // La torre è la prima casella occupata oltre la destinazione del re.
      let r = to + dir;
      while (b[r] === 0) r += dir;
      const rookTo = from + dir;
      rec.rookFrom = r;
      const rook = b[r];
      this.xorPiece(rook, r);
      b[r] = 0;
      b[rookTo] = rook;
      this.listMove(r, rookTo);
      this.xorPiece(rook, rookTo);
      this.clearVirgin(r, rec.virginCleared);
    } else if (flag === FLAG_DOUBLE) {
      // Vale sia per il doppio passo lungo y sia per quello verticale lungo z.
      this.ep = (from + to) / 2;
      this.epVictim = to;
      this.hi ^= Z_EP_HI[this.ep] ^ Z_EPV_HI[to];
      this.lo ^= Z_EP_LO[this.ep] ^ Z_EPV_LO[to];
    }

    // Solo catture e avanzamenti dei pedoni lungo y sono irreversibili: il passo verticale
    // può essere annullato risalendo/riscendendo, quindi non azzera il contatore.
    const pawnAdvance = Math.abs(piece) === PAWN && rankOf(to) !== rankOf(from);
    this.halfmove = pawnAdvance || capSq >= 0 ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.side = (-us) as Color;
    this.hi ^= Z_SIDE_HI;
    this.lo ^= Z_SIDE_LO;
    this.undoStack.push(rec);
  }

  unmakeMove() {
    const rec = this.undoStack.pop();
    if (!rec) throw new Error('Nessuna mossa da annullare');
    const b = this.board;
    const m = rec.move;
    const from = moveFrom(m), to = moveTo(m);
    const us = (-this.side) as Color;
    this.side = us;
    if (us === BLACK) this.fullmove--;

    if (rec.rookFrom >= 0) {
      const dir = to > from ? 1 : -1;
      const rookTo = from + dir;
      b[rec.rookFrom] = b[rookTo];
      b[rookTo] = 0;
      this.listMove(rookTo, rec.rookFrom);
    }
    b[to] = 0;
    b[from] = rec.piece;
    this.listMove(to, from);
    if (Math.abs(rec.piece) === KING) this.moveKing(us, to, from);
    if (rec.capSq >= 0) {
      b[rec.capSq] = rec.captured;
      this.listAdd(rec.capSq);
      if (Math.abs(rec.captured) === KING) this.kings[rec.captured > 0 ? 0 : 1].push(rec.capSq);
    }
    for (const s of rec.virginCleared) this.virgin[s] = 1;
    this.ep = rec.ep;
    this.epVictim = rec.epVictim;
    this.halfmove = rec.halfmove;
    this.hi = rec.hi;
    this.lo = rec.lo;
    this.history.pop();
  }

  /** Numero di mosse giocate con makeMove e non ancora annullate. */
  get plyCount(): number {
    return this.undoStack.length;
  }

  // ---------------------------------------------------------------- stato

  repetitionCount(): number {
    const key = this.key;
    let count = 1;
    const h = this.history;
    const stop = Math.max(0, h.length - this.halfmove);
    for (let i = h.length - 2; i >= stop; i -= 2) if (h[i] === key) count++;
    return count;
  }

  /**
   * Materiale insufficiente: niente pedoni, torri o regine e al massimo un pezzo
   * minore in tutto, oppure solo alfieri tutti sullo stesso colore di cella
   * (l'alfiere cambia due coordinate di ±1, quindi conserva la parità di x+y+z).
   */
  insufficientMaterial(): boolean {
    let minors = 0, knights = 0;
    const bishopParity = new Set<number>();
    for (let s = 0; s < CELLS; s++) {
      const t = Math.abs(this.board[s]);
      if (t === 0 || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else bishopParity.add((fileOf(s) + rankOf(s) + levelOf(s)) % 2);
    }
    return minors <= 1 || (knights === 0 && bishopParity.size === 1);
  }

  status(): GameStatus {
    const inCheck = this.inCheck();
    if (!this.hasLegalMove()) {
      return inCheck
        ? { state: 'checkmate', winner: (-this.side) as Color, inCheck }
        : { state: 'stalemate', inCheck };
    }
    if (this.halfmove >= FIFTY_MOVE_PLIES) return { state: 'draw', reason: 'fifty-move', inCheck };
    if (this.repetitionCount() >= REPETITION_LIMIT) return { state: 'draw', reason: 'repetition', inCheck };
    if (this.insufficientMaterial()) return { state: 'draw', reason: 'insufficient-material', inCheck };
    return { state: 'ongoing', inCheck };
  }

  /** Mosse legali che partono da una casella (per l'interfaccia). */
  legalMovesFrom(sq: number): Move[] {
    return this.legalMoves().filter((m) => moveFrom(m) === sq);
  }
}
