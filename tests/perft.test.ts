import { describe, expect, it } from 'vitest';
import {
  CENTER_SET,
  DOUBLE_SET,
  Position,
  SINGLE_SET,
  createInitialPosition,
  fileOf,
  levelOf,
  moveFrom,
  movePromo,
  moveTo,
  parseMove,
  rankOf,
} from '../src/engine';
import { makePosition, perft } from './helpers';
import { referenceLegal, referencePerft, stateFrom } from './reference';

/**
 * Valori perft dello schieramento iniziale. perft(1) è ricavato a mano (vedi README):
 * doppio set = 32 pedoni + 28 cavalli + 12 torri + 26 alfieri + 26 regine + 6 re = 130.
 * set singolo = 16 + 14 + 14 + 28 + 28 + 4 = 104.
 * I valori più profondi sono confermati dal generatore di riferimento indipendente.
 */
const KNOWN = {
  double: [1, 130, 16633],
  single: [1, 104, 10246],
};

describe('perft', () => {
  it('doppio set (default)', () => {
    const pos = createInitialPosition(DOUBLE_SET);
    KNOWN.double.forEach((n, d) => expect(perft(pos, d)).toBe(n));
  });

  it('set singolo', () => {
    const pos = createInitialPosition(SINGLE_SET);
    KNOWN.single.forEach((n, d) => expect(perft(pos, d)).toBe(n));
  });

  it('il generatore di riferimento conferma i valori', () => {
    expect(referencePerft(stateFrom(createInitialPosition(DOUBLE_SET)), 2)).toBe(KNOWN.double[2]);
    expect(referencePerft(stateFrom(createInitialPosition(SINGLE_SET)), 2)).toBe(KNOWN.single[2]);
  });

  it('perft(3) del doppio set e posizione intatta dopo la ricerca', () => {
    const pos = createInitialPosition(DOUBLE_SET);
    const key = pos.key;
    expect(perft(pos, 3)).toBe(2377864);
    expect(pos.key).toBe(key);
  }, 60_000);

  it('posizione con arrocco, en passant e promozioni', () => {
    const pos = makePosition(
      ['Re1.1!', 'Ta1.1!', 'Th1.1!', 'd5.4', 'b7.2', 'Cc3.3', 'Ad2.2'],
      ['Re8.1!', 'Ta8.1!', 'Th8.1!', 'e7.4!', 'g2.6', 'Df6.6', 'Ac6.5'],
      -1,
    );
    pos.makeMove(parseMove(pos, 'e7.4 -> e5.4')!);
    for (let d = 1; d <= 2; d++) expect(perft(pos, d)).toBe(referencePerft(stateFrom(pos), d));
  });
});

/** Confronta engine e riferimento mossa per mossa lungo partite pseudo-casuali. */
function randomPlayout(start: Position, plies: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pos = start.clone();
  for (let i = 0; i < plies; i++) {
    const legal = pos.legalMoves();
    const ref = referenceLegal(stateFrom(pos)).map((r) => r.key).sort();
    const mine = legal
      .map((m) => {
        const f = moveFrom(m), t = moveTo(m);
        return `${fileOf(f)},${rankOf(f)},${levelOf(f)}>${fileOf(t)},${rankOf(t)},${levelOf(t)}=${movePromo(m)}`;
      })
      .sort();
    expect(mine).toEqual(ref);
    if (legal.length === 0) break;
    // Preferisce le catture per arrivare prima a posizioni movimentate.
    const captures = legal.filter((m) => pos.board[moveTo(m)] !== 0);
    const pool = captures.length && rnd() < 0.6 ? captures : legal;
    pos.makeMove(pool[Math.floor(rnd() * pool.length)]);
  }
  return pos;
}

describe('confronto con il generatore di riferimento', () => {
  it.each([
    ['single', SINGLE_SET, 1],
    ['center', CENTER_SET, 2],
    ['double', DOUBLE_SET, 3],
  ])('partite casuali (%s)', (_name, setup, seed) => {
    const start = createInitialPosition(setup);
    for (let g = 0; g < 3; g++) randomPlayout(start, 120, seed * 100 + g);
  }, 60_000);

  it('make/unmake ripristina scacchiera, hash e diritti', () => {
    const start = createInitialPosition(DOUBLE_SET);
    const pos = start.clone();
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const keys: number[] = [];
    for (let i = 0; i < 150; i++) {
      const legal = pos.legalMoves();
      if (!legal.length) break;
      keys.push(pos.key);
      pos.makeMove(legal[Math.floor(rnd() * legal.length)]);
      // L'hash incrementale coincide con quello ricalcolato da zero.
      expect(pos.key).toBe(Position.fromSnapshot(pos.snapshot()).key);
    }
    while (keys.length) {
      pos.unmakeMove();
      expect(pos.key).toBe(keys.pop());
    }
    expect(Array.from(pos.board)).toEqual(Array.from(start.board));
    expect(Array.from(pos.virgin)).toEqual(Array.from(start.virgin));
  });
});

describe('prestazioni', () => {
  it('genera le mosse legali dello schieramento iniziale rapidamente', () => {
    const pos = createInitialPosition();
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) pos.legalMoves();
    const perCall = (performance.now() - t0) / 200;
    expect(perCall).toBeLessThan(5); // tipicamente ~0.2 ms
  });
});
