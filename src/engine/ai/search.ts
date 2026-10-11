import { FLAG_EP, moveFlag, moveFrom, movePromo, moveTo, type Move } from '../move';
import { FIFTY_MOVE_PLIES, type Position } from '../position';
import { evaluate, PIECE_VALUES } from './evaluate';

/**
 * Ricerca minimax in forma negamax con potatura alfa-beta, approfondimento
 * iterativo, ricerca di quiescenza sulle catture, tabella di trasposizione e
 * ordinamento delle mosse (mossa della TT, MVV-LVA, killer move).
 */

export const MATE = 1_000_000;
const MATE_THRESHOLD = MATE - 1000;
const INF = MATE + 1;
const MAX_PLY = 64;

export interface SearchOptions {
  /** Profondità massima in semimosse. */
  maxDepth: number;
  /** Tempo massimo in millisecondi: la ricerca si ferma e restituisce l'ultima profondità completata. */
  timeMs: number;
  /** Profondità massima della quiescenza (solo catture/promozioni). */
  quiescenceDepth?: number;
  /** Rumore casuale (centipedoni) sulla scelta finale, per livelli facili. */
  randomness?: number;
  /** Generatore casuale iniettabile (per test deterministici). */
  random?: () => number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface Difficulty {
  id: 'easy' | 'medium' | 'hard';
  label: string;
  options: SearchOptions;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'easy', label: 'Facile', options: { maxDepth: 1, timeMs: 1500, quiescenceDepth: 2, randomness: 60 } },
  { id: 'medium', label: 'Medio', options: { maxDepth: 2, timeMs: 4000, quiescenceDepth: 4, randomness: 10 } },
  { id: 'hard', label: 'Difficile', options: { maxDepth: 4, timeMs: 9000, quiescenceDepth: 6 } },
];

const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  move: Move;
}
const TT_MAX = 400_000;

class TimeUp extends Error {}

export class Searcher {
  private tt = new Map<number, TTEntry>();
  private killers: Move[][] = [];
  private nodes = 0;
  private deadline = 0;
  private qDepth = 4;

  constructor(private pos: Position) {}

  search(opts: SearchOptions): SearchResult {
    const start = performance.now();
    this.deadline = start + opts.timeMs;
    this.qDepth = opts.quiescenceDepth ?? 4;
    this.nodes = 0;
    const pos = this.pos;
    const startPly = pos.plyCount;
    const legal = pos.legalMoves();
    if (legal.length === 0) return { move: null, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0, timeMs: 0 };

    // Ordine iniziale ragionevole: se il tempo scade subito si gioca comunque una mossa sensata.
    legal.splice(0, legal.length, ...this.orderMoves(legal, 0, -1));
    let best: Move = legal[0];
    let bestScore = -INF;
    const exact = !!opts.randomness;
    let completed = 0;
    let rootScores = new Map<Move, number>();
    for (let depth = 1; depth <= opts.maxDepth; depth++) {
      try {
        const scores = this.searchRoot(legal, depth, best, exact);
        rootScores = scores;
        completed = depth;
        // Riordina le mosse alla radice: la migliore per prima alla profondità successiva.
        legal.sort((a, b) => (scores.get(b) ?? -INF) - (scores.get(a) ?? -INF));
        best = legal[0];
        bestScore = scores.get(best)!;
        if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
      } catch (e) {
        if (!(e instanceof TimeUp)) throw e;
        // L'interruzione arriva a metà ricerca: annulla le mosse rimaste giocate.
        while (pos.plyCount > startPly) pos.unmakeMove();
        break;
      }
    }

    if (opts.randomness && completed > 0) {
      const rnd = opts.random ?? Math.random;
      let pick = best, pickScore = -INF;
      for (const [m, sc] of rootScores) {
        const noisy = sc + (rnd() * 2 - 1) * opts.randomness;
        if (noisy > pickScore) {
          pickScore = noisy;
          pick = m;
        }
      }
      // Non scegliere mai una mossa che perde nettamente rispetto alla migliore.
      if ((rootScores.get(pick) ?? -INF) > bestScore - opts.randomness * 2) best = pick;
    }
    return { move: best, score: bestScore, depth: completed, nodes: this.nodes, timeMs: performance.now() - start };
  }

  /**
   * Con `exact` ogni mossa alla radice riceve un punteggio esatto (finestra piena),
   * necessario per scegliere a caso tra mosse quasi equivalenti; altrimenti alfa-beta
   * standard, dove le mosse peggiori hanno solo un limite superiore.
   */
  private searchRoot(moves: Move[], depth: number, pvMove: Move, exact: boolean): Map<Move, number> {
    const scores = new Map<Move, number>();
    let alpha = -INF;
    const ordered = [pvMove, ...moves.filter((m) => m !== pvMove)];
    for (const m of ordered) {
      this.pos.makeMove(m);
      const score = -this.negamax(depth - 1, -INF, exact ? INF : -alpha, 1);
      this.pos.unmakeMove();
      scores.set(m, score);
      if (score > alpha) alpha = score;
    }
    return scores;
  }

  private checkTime() {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new TimeUp();
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.checkTime();
    const pos = this.pos;
    if (pos.halfmove >= FIFTY_MOVE_PLIES || pos.repetitionCount() >= 2) return 0;
    if (ply >= MAX_PLY) return evaluate(pos);

    const inCheck = pos.inCheck();
    if (depth <= 0 && !inCheck) return this.quiescence(alpha, beta, ply, this.qDepth);

    const key = pos.key;
    const entry = this.tt.get(key);
    let ttMove = 0;
    if (entry) {
      ttMove = entry.move;
      if (entry.depth >= depth) {
        const sc = fromTT(entry.score, ply);
        if (entry.flag === TT_EXACT) return sc;
        if (entry.flag === TT_LOWER && sc >= beta) return sc;
        if (entry.flag === TT_UPPER && sc <= alpha) return sc;
      }
    }

    const moves = this.orderMoves(pos.generatePseudo(), ttMove, ply);
    const us = pos.side;
    const alphaStart = alpha;
    let best = -INF, bestMove = 0, legalCount = 0;
    // Sotto scacco all'orizzonte si esaminano tutte le parate (non solo le catture).
    const nextDepth = Math.max(0, depth - 1);
    for (const m of moves) {
      pos.makeMove(m);
      if (pos.inCheck(us)) {
        pos.unmakeMove();
        continue;
      }
      legalCount++;
      // PVS: la prima mossa con finestra piena, le altre con finestra nulla e ricerca ripetuta se migliorano.
      let score: number;
      if (legalCount === 1) score = -this.negamax(nextDepth, -beta, -alpha, ply + 1);
      else {
        score = -this.negamax(nextDepth, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && score < beta) score = -this.negamax(nextDepth, -beta, -alpha, ply + 1);
      }
      pos.unmakeMove();
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!this.isCapture(m)) this.addKiller(m, ply);
        break;
      }
    }
    if (legalCount === 0) return inCheck ? -MATE + ply : 0;

    const flag = best <= alphaStart ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    if (this.tt.size >= TT_MAX) this.tt.clear();
    this.tt.set(key, { depth, score: toTT(best, ply), flag, move: bestMove });
    return best;
  }

  private quiescence(alpha: number, beta: number, ply: number, qdepth: number): number {
    this.checkTime();
    const pos = this.pos;
    const standPat = evaluate(pos);
    if (standPat >= beta || qdepth <= 0) return standPat;
    if (standPat > alpha) alpha = standPat;
    const us = pos.side;
    const moves = this.orderMoves(pos.generatePseudo([], true), 0, -1);
    for (const m of moves) {
      pos.makeMove(m);
      if (pos.inCheck(us)) {
        pos.unmakeMove();
        continue;
      }
      const score = -this.quiescence(-beta, -alpha, ply + 1, qdepth - 1);
      pos.unmakeMove();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private isCapture(m: Move): boolean {
    return this.pos.board[moveTo(m)] !== 0;
  }

  private addKiller(m: Move, ply: number) {
    const k = (this.killers[ply] ??= []);
    if (k[0] !== m) {
      k[1] = k[0];
      k[0] = m;
    }
  }

  /** Ordina: mossa della TT, catture MVV-LVA, promozioni, killer, resto. */
  private orderMoves(moves: Move[], ttMove: Move, ply: number): Move[] {
    const b = this.pos.board;
    const killers = ply >= 0 ? this.killers[ply] : undefined;
    const scored = moves.map((m) => {
      let s = 0;
      if (m === ttMove) s = 1e7;
      else {
        const victim = Math.abs(b[moveTo(m)]);
        if (victim) s = 1e6 + PIECE_VALUES[victim] * 10 - PIECE_VALUES[Math.abs(b[moveFrom(m)])] / 10;
        else if (moveFlag(m) === FLAG_EP) s = 1e6 + 1000;
        const promo = movePromo(m);
        if (promo) s += 5e5 + PIECE_VALUES[promo];
        if (!s && killers && (killers[0] === m || killers[1] === m)) s = 1e5;
      }
      return { m, s };
    });
    scored.sort((a, b2) => b2.s - a.s);
    return scored.map((x) => x.m);
  }
}

const toTT = (score: number, ply: number) =>
  score >= MATE_THRESHOLD ? score + ply : score <= -MATE_THRESHOLD ? score - ply : score;
const fromTT = (score: number, ply: number) =>
  score >= MATE_THRESHOLD ? score - ply : score <= -MATE_THRESHOLD ? score + ply : score;

/** Comodità: cerca la mossa migliore per la posizione data (che viene lasciata intatta). */
export function findBestMove(pos: Position, opts: SearchOptions): SearchResult {
  return new Searcher(pos).search(opts);
}
