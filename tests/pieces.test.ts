import { describe, expect, it } from 'vitest';
import {
  BISHOP_DIRS,
  DIRECTIONS,
  KNIGHT_OFFSETS,
  QUEEN_DIRS,
  ROOK_DIRS,
  movePromo,
  moveTo,
  parseSquare,
  QUEEN,
  ROOK,
  BISHOP,
  KNIGHT,
} from '../src/engine';
import { makePosition, movesFrom, targetsFrom } from './helpers';

// Posizioni senza re: il generatore funziona anche così e i conteggi restano puliti.
const CENTER = 'd4.4'; // (3,3,3)

describe('tabelle di direzione', () => {
  it('ha il numero giusto di direzioni per pezzo', () => {
    expect(DIRECTIONS).toHaveLength(26);
    expect(ROOK_DIRS).toHaveLength(6);
    expect(BISHOP_DIRS).toHaveLength(12);
    expect(QUEEN_DIRS).toHaveLength(26);
    expect(KNIGHT_OFFSETS).toHaveLength(24);
  });
});

describe('Torre', () => {
  it('scorre lungo i 3 assi su scacchiera libera', () => {
    const pos = makePosition([`T${CENTER}`], []);
    expect(targetsFrom(pos, CENTER)).toHaveLength(21);
    expect(targetsFrom(pos, CENTER)).toContain('d4.8');
    expect(targetsFrom(pos, CENTER)).toContain('a4.4');
    expect(targetsFrom(pos, CENTER)).not.toContain('e5.4');
  });

  it('dall’angolo ha 21 mosse', () => {
    expect(targetsFrom(makePosition(['Ta1.1'], []), 'a1.1')).toHaveLength(21);
  });

  it('si ferma davanti a un pezzo amico', () => {
    const pos = makePosition([`T${CENTER}`, 'd6.4'], []);
    const t = targetsFrom(pos, CENTER);
    expect(t).toContain('d5.4');
    expect(t).not.toContain('d6.4');
    expect(t).not.toContain('d7.4');
    expect(t).toHaveLength(18);
  });

  it('cattura il primo pezzo avversario e non va oltre', () => {
    const pos = makePosition([`T${CENTER}`], ['d4.6']);
    const t = targetsFrom(pos, CENTER);
    expect(t).toContain('d4.5');
    expect(t).toContain('d4.6');
    expect(t).not.toContain('d4.7');
    expect(t).toHaveLength(19);
  });
});

describe('Alfiere', () => {
  it('scorre lungo le 12 diagonali planari', () => {
    const pos = makePosition([`A${CENTER}`], []);
    const t = targetsFrom(pos, CENTER);
    expect(t).toHaveLength(39);
    expect(t).toContain('e5.4'); // piano x/y
    expect(t).toContain('e4.5'); // piano x/z
    expect(t).toContain('d5.5'); // piano y/z
    expect(t).not.toContain('e5.5'); // diagonale sui tre assi: solo la regina
    expect(t).not.toContain('d5.4'); // asse: solo torre/regina
  });

  it('conserva il colore della cella (parità di x+y+z)', () => {
    const pos = makePosition([`A${CENTER}`], []);
    for (const sq of targetsFrom(pos, CENTER)) {
      const s = parseSquare(sq);
      expect((s % 8) + (Math.floor(s / 8) % 8) + Math.floor(s / 64)).toSatisfy((v: number) => v % 2 === 1);
    }
  });

  it('è bloccato dai pezzi amici e cattura il primo avversario', () => {
    const pos = makePosition([`A${CENTER}`, 'f6.4'], ['d6.6']);
    const t = targetsFrom(pos, CENTER);
    expect(t).toContain('e5.4');
    expect(t).not.toContain('f6.4');
    expect(t).toContain('d6.6');
    expect(t).not.toContain('d7.7');
    expect(t).toHaveLength(39 - 3 - 2);
  });
});

describe('Regina', () => {
  it('combina torre, alfiere e diagonali sui tre assi', () => {
    const t = targetsFrom(makePosition([`D${CENTER}`], []), CENTER);
    expect(t).toHaveLength(21 + 39 + 25);
    expect(t).toContain('e5.5');
    expect(t).toContain('a1.1');
    expect(t).toContain('h8.8');
  });

  it('è bloccata sulla diagonale triassiale e cattura', () => {
    const pos = makePosition([`D${CENTER}`, 'f6.6'], ['c3.3']);
    const t = targetsFrom(pos, CENTER);
    expect(t).toContain('e5.5');
    expect(t).not.toContain('f6.6');
    expect(t).toContain('c3.3');
    expect(t).not.toContain('b2.2');
  });
});

describe('Re', () => {
  it('si muove di una casella nelle 26 direzioni', () => {
    expect(targetsFrom(makePosition([`R${CENTER}`], []), CENTER)).toHaveLength(26);
    expect(targetsFrom(makePosition(['Ra1.1'], []), 'a1.1')).toHaveLength(7);
  });

  it('non può entrare in una casella attaccata', () => {
    const pos = makePosition([`R${CENTER}`], ['Te8.4']);
    const t = targetsFrom(pos, CENTER);
    for (const s of ['e3.4', 'e4.4', 'e5.4']) expect(t).not.toContain(s);
    expect(t).toHaveLength(23);
  });

  it('cattura un pezzo non protetto ma non uno protetto', () => {
    const pos = makePosition([`R${CENTER}`], ['d5.4', 'e4.4', 'Te8.4']);
    const t = targetsFrom(pos, CENTER);
    expect(t).toContain('d5.4');
    expect(t).not.toContain('e4.4');
  });
});

describe('Cavallo', () => {
  it('ha 24 salti dal centro e salta i pezzi', () => {
    const blockers = ['c3.3', 'c3.4', 'c3.5', 'c4.3', 'c4.4', 'c4.5', 'c5.3', 'c5.4', 'c5.5',
      'd3.3', 'd3.4', 'd3.5', 'd4.3', 'd4.5', 'd5.3', 'd5.4', 'd5.5',
      'e3.3', 'e3.4', 'e3.5', 'e4.3', 'e4.4', 'e4.5', 'e5.3', 'e5.4', 'e5.5'];
    expect(targetsFrom(makePosition([`C${CENTER}`], []), CENTER)).toHaveLength(24);
    expect(targetsFrom(makePosition([`C${CENTER}`, ...blockers], []), CENTER)).toHaveLength(24);
  });

  it('dall’angolo ha 6 salti', () => {
    expect(targetsFrom(makePosition(['Ca1.1'], []), 'a1.1').sort()).toEqual(
      ['a2.3', 'a3.2', 'b1.3', 'b3.1', 'c1.2', 'c2.1'].sort(),
    );
  });

  it('cattura gli avversari ma non i propri pezzi', () => {
    const pos = makePosition([`C${CENTER}`, 'f5.4'], ['f3.4']);
    const t = targetsFrom(pos, CENTER);
    expect(t).not.toContain('f5.4');
    expect(t).toContain('f3.4');
  });
});

describe('Pedone', () => {
  // Pezzi amici sopra e sotto (d4.5 e d4.3) bloccano il passo verticale, per isolare quello lungo y.
  const LID = ['d4.3', 'd4.5'];

  it('avanza di una casella lungo y', () => {
    expect(targetsFrom(makePosition([CENTER, ...LID], []), CENTER)).toEqual(['d5.4']);
    expect(targetsFrom(makePosition([], [CENTER, ...LID], -1), CENTER)).toEqual(['d3.4']);
  });

  it('alla prima mossa può avanzare di due se il percorso è libero', () => {
    const lid = ['d2.2', 'd2.4'];
    expect(targetsFrom(makePosition(['d2.3!', ...lid], []), 'd2.3')).toEqual(['d3.3', 'd4.3']);
    expect(targetsFrom(makePosition(['d2.3!', 'd4.3', ...lid], []), 'd2.3')).toEqual(['d3.3']);
    expect(targetsFrom(makePosition(['d2.3!', ...lid], ['d3.3']), 'd2.3')).toEqual([]);
  });

  it('sale o scende di un livello se la cella è libera', () => {
    expect(targetsFrom(makePosition([CENTER], []), CENTER)).toEqual(['d4.3', 'd4.5', 'd5.4']);
    expect(targetsFrom(makePosition([], [CENTER], -1), CENTER)).toEqual(['d3.4', 'd4.3', 'd4.5']);
    // Bloccato sopra da un avversario: niente cattura in verticale.
    expect(targetsFrom(makePosition([CENTER, 'd5.4'], ['d4.5']), CENTER)).toEqual(['d4.3']);
    // Ai bordi del cubo resta una sola direzione verticale.
    expect(targetsFrom(makePosition(['d4.1', 'd5.1'], []), 'd4.1')).toEqual(['d4.2']);
    expect(targetsFrom(makePosition(['d4.8', 'd5.8'], []), 'd4.8')).toEqual(['d4.7']);
  });

  it('alla prima mossa può salire o scendere di due livelli se il percorso è libero', () => {
    expect(targetsFrom(makePosition(['d2.4!', 'd3.4'], []), 'd2.4')).toEqual(['d2.2', 'd2.3', 'd2.5', 'd2.6']);
    expect(targetsFrom(makePosition(['d2.4!', 'd3.4', 'd2.6'], ['d2.2']), 'd2.4')).toEqual(['d2.3', 'd2.5']);
    // Dopo essersi mosso non può più fare il doppio passo.
    expect(targetsFrom(makePosition(['d2.4', 'd3.4'], []), 'd2.4')).toEqual(['d2.3', 'd2.5']);
  });

  it('il passo verticale non azzera il contatore delle 50 mosse, l’avanzamento sì', () => {
    const pos = makePosition(['Ra1.1', 'd4.4'], ['Rh8.8']);
    pos.halfmove = 10;
    pos.makeMove(movesFrom(pos, 'd4.4').find((m) => moveTo(m) === parseSquare('d4.5'))!);
    expect(pos.halfmove).toBe(11);
    pos.unmakeMove();
    pos.makeMove(movesFrom(pos, 'd4.4').find((m) => moveTo(m) === parseSquare('d5.4'))!);
    expect(pos.halfmove).toBe(0);
  });

  it('cattura in diagonale avanti su x e su z (4 catture)', () => {
    const pos = makePosition([CENTER, ...LID], ['c5.4', 'e5.4', 'd5.3', 'd5.5', 'e5.5', 'c3.4']);
    expect(targetsFrom(pos, CENTER)).toEqual(['c5.4', 'd5.3', 'd5.5', 'd5.4', 'e5.4'].sort());
  });

  it('non cattura in avanti dritto né i propri pezzi', () => {
    const pos = makePosition([CENTER, 'c5.4', ...LID], ['d5.4']);
    expect(targetsFrom(pos, CENTER)).toEqual([]);
  });

  it('il pedone nero cattura verso y decrescente', () => {
    const pos = makePosition(['c3.4', 'd3.5'], [CENTER, ...LID], -1);
    expect(targetsFrom(pos, CENTER)).toEqual(['c3.4', 'd3.4', 'd3.5']);
  });
});

describe('Promozione', () => {
  const toRank8 = (pos: ReturnType<typeof makePosition>, from: string, to: string) =>
    movesFrom(pos, from).filter((m) => moveTo(m) === parseSquare(to));

  it('genera le 4 scelte sull’ultima traversa', () => {
    const pos = makePosition(['a7.1'], []);
    expect(toRank8(pos, 'a7.1', 'a8.1').map(movePromo).sort()).toEqual([QUEEN, ROOK, BISHOP, KNIGHT].sort());
    // Il passo verticale sulla traversa 7 non promuove.
    expect(toRank8(pos, 'a7.1', 'a7.2').map(movePromo)).toEqual([0]);
  });

  it('sostituisce il pedone con il pezzo scelto, anche catturando', () => {
    const pos = makePosition(['a7.1'], ['a8.2']);
    const m = movesFrom(pos, 'a7.1').find((mv) => movePromo(mv) === KNIGHT && moveTo(mv) === parseSquare('a8.2'))!;
    pos.makeMove(m);
    expect(pos.board[parseSquare('a8.2')]).toBe(KNIGHT);
    expect(pos.board[parseSquare('a7.1')]).toBe(0);
    pos.unmakeMove();
    expect(pos.board[parseSquare('a7.1')]).toBe(1);
    expect(pos.board[parseSquare('a8.2')]).toBe(-1);
  });

  it('il nero promuove sulla traversa 1', () => {
    const pos = makePosition([], ['h2.8'], -1);
    expect(toRank8(pos, 'h2.8', 'h1.8').map(movePromo)).toHaveLength(4);
  });
});
