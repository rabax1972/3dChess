import { FLAG_EP, moveFlag, moveFrom, moveTo, type Move } from './move';
import { moveToNotation } from './notation';
import { Position } from './position';
import { createInitialPosition, DEFAULT_SETUP, type SetupDefinition } from './setup';
import type { Color, GameStatus } from './types';

export interface PlayedMove {
  move: Move;
  notation: string;
  color: Color;
  piece: number;
  /** Pezzo catturato (0 = nessuno) e casella in cui si trovava. */
  captured: number;
  capturedSquare: number;
}

/**
 * Partita: posizione corrente + elenco delle mosse giocate, annulla/ripeti.
 * È il punto d'ingresso usato da UI e IA; la logica delle regole vive in Position.
 */
export class Game {
  pos: Position;
  played: PlayedMove[] = [];
  private redoStack: Move[] = [];

  constructor(public setup: SetupDefinition = DEFAULT_SETUP) {
    this.pos = createInitialPosition(setup);
  }

  reset(setup: SetupDefinition = this.setup) {
    this.setup = setup;
    this.pos = createInitialPosition(setup);
    this.played = [];
    this.redoStack = [];
  }

  get turn(): Color {
    return this.pos.side;
  }

  legalMoves(): Move[] {
    return this.pos.legalMoves();
  }

  legalMovesFrom(sq: number): Move[] {
    return this.pos.legalMovesFrom(sq);
  }

  status(): GameStatus {
    return this.pos.status();
  }

  /** Gioca una mossa legale. Lancia un errore se la mossa non è legale. */
  play(m: Move, keepRedo = false): PlayedMove {
    if (!this.pos.legalMoves().includes(m)) throw new Error('Mossa illegale');
    const from = moveFrom(m), to = moveTo(m);
    const piece = this.pos.board[from];
    const capturedSquare =
      moveFlag(m) === FLAG_EP ? this.pos.epVictim : this.pos.board[to] !== 0 ? to : -1;
    const record: PlayedMove = {
      move: m,
      notation: moveToNotation(this.pos, m),
      color: this.pos.side,
      piece,
      captured: capturedSquare >= 0 ? this.pos.board[capturedSquare] : 0,
      capturedSquare,
    };
    this.pos.makeMove(m);
    this.played.push(record);
    if (!keepRedo) this.redoStack = [];
    return record;
  }

  canUndo(): boolean {
    return this.played.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): PlayedMove | undefined {
    const last = this.played.pop();
    if (!last) return undefined;
    this.pos.unmakeMove();
    this.redoStack.push(last.move);
    return last;
  }

  /** Prossima mossa che redo() rigiocherebbe. */
  peekRedo(): Move | undefined {
    return this.redoStack.at(-1);
  }

  redo(): PlayedMove | undefined {
    const m = this.redoStack.pop();
    return m === undefined ? undefined : this.play(m, true);
  }
}
