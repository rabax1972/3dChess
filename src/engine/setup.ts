import { Position } from './position';
import { BISHOP, BLACK, KING, KNIGHT, PAWN, QUEEN, ROOK, SIZE, WHITE, type Color, type PieceType, type Placement } from './types';

/**
 * Schieramenti iniziali. Per cambiare la posizione di partenza basta aggiungere
 * (o modificare) una SetupDefinition: nessun altro file contiene coordinate fisse.
 * Tutte le coordinate qui sono 1-based, come nella notazione (traversa 1-8, livello 1-8).
 */

export interface ArmyDefinition {
  /** Livelli occupati da un set completo di pezzi (1-8). */
  levels: number[];
  /** Traversa dei pezzi (1-8). */
  backRank: number;
  /** Traversa dei pedoni (1-8). */
  pawnRank: number;
}

export interface SetupDefinition {
  id: string;
  name: string;
  description: string;
  /** Pezzi della traversa di fondo, dalla colonna a alla colonna h. */
  backRankOrder: readonly PieceType[];
  white: ArmyDefinition;
  black: ArmyDefinition;
  /** Pezzi aggiuntivi (coordinate 0-based), per varianti personalizzate. */
  extra?: readonly Placement[];
}

export const CLASSIC_BACK_RANK: readonly PieceType[] = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];

/** Default: un set per parte, entrambi sul livello più basso, come su una scacchiera classica. */
export const CLASSIC_SET: SetupDefinition = {
  id: 'classic',
  name: 'Classico sul livello 1 (default)',
  description: '16 pezzi per parte, Bianco e Nero entrambi sul livello 1.',
  backRankOrder: CLASSIC_BACK_RANK,
  white: { levels: [1], backRank: 1, pawnRank: 2 },
  black: { levels: [1], backRank: 8, pawnRank: 7 },
};

/** Un set per parte sui livelli estremi: Bianco in basso, Nero in alto. */
export const WHITE_BOTTOM_SET: SetupDefinition = {
  id: 'white-bottom',
  name: 'Bianco in basso, Nero in alto',
  description: '16 pezzi per parte: Bianco sul livello 1, Nero sul livello 8.',
  backRankOrder: CLASSIC_BACK_RANK,
  white: { levels: [1], backRank: 1, pawnRank: 2 },
  black: { levels: [8], backRank: 8, pawnRank: 7 },
};

/** Come sopra, a livelli invertiti: Nero in basso, Bianco in alto. */
export const BLACK_BOTTOM_SET: SetupDefinition = {
  id: 'black-bottom',
  name: 'Nero in basso, Bianco in alto',
  description: '16 pezzi per parte: Nero sul livello 1, Bianco sul livello 8.',
  backRankOrder: CLASSIC_BACK_RANK,
  white: { levels: [8], backRank: 1, pawnRank: 2 },
  black: { levels: [1], backRank: 8, pawnRank: 7 },
};

/** Variante: due set completi per giocatore, Bianco sui livelli 1-2, Nero sui livelli 7-8. */
export const DOUBLE_SET: SetupDefinition = {
  id: 'double',
  name: 'Doppio set',
  description: '32 pezzi per parte: Bianco sui livelli 1-2, Nero sui livelli 7-8.',
  backRankOrder: CLASSIC_BACK_RANK,
  white: { levels: [1, 2], backRank: 1, pawnRank: 2 },
  black: { levels: [7, 8], backRank: 8, pawnRank: 7 },
};

export const SETUPS: readonly SetupDefinition[] = [CLASSIC_SET, WHITE_BOTTOM_SET, BLACK_BOTTOM_SET, DOUBLE_SET];
export const DEFAULT_SETUP = CLASSIC_SET;

function armyPlacements(def: SetupDefinition, army: ArmyDefinition, color: Color): Placement[] {
  if (def.backRankOrder.length !== SIZE) throw new Error(`backRankOrder deve avere ${SIZE} pezzi`);
  const out: Placement[] = [];
  for (const level of army.levels) {
    const z = level - 1;
    def.backRankOrder.forEach((type, x) => out.push({ type, color, x, y: army.backRank - 1, z }));
    for (let x = 0; x < SIZE; x++) out.push({ type: PAWN, color, x, y: army.pawnRank - 1, z });
  }
  return out;
}

export function buildPlacements(def: SetupDefinition): Placement[] {
  return [...armyPlacements(def, def.white, WHITE), ...armyPlacements(def, def.black, BLACK), ...(def.extra ?? [])];
}

export function createInitialPosition(def: SetupDefinition = DEFAULT_SETUP): Position {
  return Position.fromPlacements(buildPlacements(def), WHITE);
}
