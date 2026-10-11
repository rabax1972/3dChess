import {
  BISHOP,
  BLACK,
  KING,
  KNIGHT,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  levelOf,
  moveFrom,
  moveTo,
  parseSquare,
  rankOf,
  squareName,
  type Color,
  type Move,
  type PieceType,
  type Placement,
} from '../src/engine';

const LETTER_TYPES: Record<string, PieceType> = { R: KING, D: QUEEN, T: ROOK, A: BISHOP, C: KNIGHT, '': PAWN };

/**
 * Costruisce una posizione da stringhe come "Re1.1", "Td4.4", "c5.3" (pedone).
 * Per default i pezzi sono considerati già mossi; il suffisso "!" li marca
 * come mai mossi (serve per arrocco e doppio passo).
 */
export function makePosition(white: string[], black: string[], side: Color = WHITE): Position {
  const parse = (spec: string, color: Color): Placement => {
    const m = /^([RDTAC]?)([a-h][1-8]\.[1-8])(!?)$/.exec(spec);
    if (!m) throw new Error(`Spec non valida: ${spec}`);
    const s = parseSquare(m[2]);
    return { type: LETTER_TYPES[m[1]], color, x: fileOf(s), y: rankOf(s), z: levelOf(s), moved: m[3] !== '!' };
  };
  return Position.fromPlacements([...white.map((s) => parse(s, WHITE)), ...black.map((s) => parse(s, BLACK))], side);
}

/** Destinazioni (in notazione) delle mosse legali che partono dalla casella data. */
export function targetsFrom(pos: Position, square: string): string[] {
  const from = parseSquare(square);
  return [...new Set(pos.legalMoves().filter((m) => moveFrom(m) === from).map((m) => squareName(moveTo(m))))].sort();
}

export function movesFrom(pos: Position, square: string): Move[] {
  const from = parseSquare(square);
  return pos.legalMoves().filter((m) => moveFrom(m) === from);
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pos.legalMoves()) {
    pos.makeMove(m);
    n += perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return n;
}
