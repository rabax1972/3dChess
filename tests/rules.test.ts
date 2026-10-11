import { describe, expect, it } from 'vitest';
import {
  BLACK,
  DOUBLE_SET,
  FLAG_CASTLE,
  FLAG_EP,
  Game,
  KING,
  PAWN,
  ROOK,
  moveFlag,
  moveTo,
  parseMove,
  parseSquare,
} from '../src/engine';
import { makePosition, movesFrom, targetsFrom } from './helpers';

const sq = parseSquare;

describe('En passant', () => {
  it('cattura sulla diagonale x dopo un doppio passo', () => {
    const pos = makePosition(['Ra1.1', 'd5.4'], ['Rh8.8', 'e7.4!'], BLACK);
    pos.makeMove(parseMove(pos, 'e7.4 -> e5.4')!);
    const ep = movesFrom(pos, 'd5.4').find((m) => moveFlag(m) === FLAG_EP)!;
    expect(ep).toBeDefined();
    expect(moveTo(ep)).toBe(sq('e6.4'));
    pos.makeMove(ep);
    expect(pos.board[sq('e5.4')]).toBe(0);
    expect(pos.board[sq('e6.4')]).toBe(PAWN);
    pos.unmakeMove();
    expect(pos.board[sq('e5.4')]).toBe(-PAWN);
    expect(pos.board[sq('d5.4')]).toBe(PAWN);
  });

  it('cattura sulla diagonale z dopo un doppio passo', () => {
    const pos = makePosition(['Ra1.1', 'd5.4'], ['Rh8.8', 'd7.5!'], BLACK);
    pos.makeMove(parseMove(pos, 'd7.5 -> d5.5')!);
    expect(targetsFrom(pos, 'd5.4')).toContain('d6.5');
    pos.makeMove(parseMove(pos, 'd5.4 x d6.5')!);
    expect(pos.board[sq('d5.5')]).toBe(0);
  });

  it('cattura dopo un doppio passo verticale, rimuovendo il pedone dal suo livello', () => {
    // Il nero scende da d6.6 a d6.4 scavalcando d6.5; il bianco in d5.4 cattura su d6.5 (z+1).
    const pos = makePosition(['Ra1.1', 'd5.4', 'd5.5'], ['Rh8.8', 'd6.6!', 'd7.6'], BLACK);
    pos.makeMove(parseMove(pos, 'd6.6 -> d6.4')!);
    expect(pos.ep).toBe(sq('d6.5'));
    expect(pos.epVictim).toBe(sq('d6.4'));
    const ep = movesFrom(pos, 'd5.4').find((m) => moveFlag(m) === FLAG_EP)!;
    expect(moveTo(ep)).toBe(sq('d6.5'));
    const key = pos.key;
    pos.makeMove(ep);
    expect(pos.board[sq('d6.4')]).toBe(0);
    expect(pos.board[sq('d6.5')]).toBe(PAWN);
    pos.unmakeMove();
    expect(pos.board[sq('d6.4')]).toBe(-PAWN);
    expect(pos.key).toBe(key);
  });

  it('è possibile solo nella mossa immediatamente successiva', () => {
    const pos = makePosition(['Ra1.1', 'd5.4'], ['Rh8.8', 'e7.4!'], BLACK);
    pos.makeMove(parseMove(pos, 'e7.4 -> e5.4')!);
    pos.makeMove(parseMove(pos, 'Ra1.1 -> a2.1')!);
    pos.makeMove(parseMove(pos, 'Rh8.8 -> h7.8')!);
    expect(movesFrom(pos, 'd5.4').some((m) => moveFlag(m) === FLAG_EP)).toBe(false);
  });

  it('non è possibile dopo un passo singolo', () => {
    const pos = makePosition(['Ra1.1', 'd5.4'], ['Rh8.8', 'e6.4'], BLACK);
    pos.makeMove(parseMove(pos, 'e6.4 -> e5.4')!);
    expect(movesFrom(pos, 'd5.4').some((m) => moveFlag(m) === FLAG_EP)).toBe(false);
  });
});

describe('Arrocco', () => {
  const base = () => makePosition(['Re1.1!', 'Ta1.1!', 'Th1.1!'], ['Re8.8']);

  it('corto e lungo sul piano del re', () => {
    const pos = base();
    const castles = movesFrom(pos, 'e1.1').filter((m) => moveFlag(m) === FLAG_CASTLE);
    expect(castles.map((m) => moveTo(m)).sort()).toEqual([sq('c1.1'), sq('g1.1')].sort());
  });

  it('sposta re e torre (corto) e si annulla correttamente', () => {
    const pos = base();
    const key = pos.key;
    pos.makeMove(parseMove(pos, 'Re1.1 -> g1.1')!);
    expect(pos.board[sq('g1.1')]).toBe(KING);
    expect(pos.board[sq('f1.1')]).toBe(ROOK);
    expect(pos.board[sq('h1.1')]).toBe(0);
    pos.unmakeMove();
    expect(pos.board[sq('e1.1')]).toBe(KING);
    expect(pos.board[sq('h1.1')]).toBe(ROOK);
    expect(pos.key).toBe(key);
  });

  it('lungo: torre su d, richiede b libera', () => {
    const pos = base();
    pos.makeMove(parseMove(pos, 'Re1.1 -> c1.1')!);
    expect(pos.board[sq('c1.1')]).toBe(KING);
    expect(pos.board[sq('d1.1')]).toBe(ROOK);
    const blocked = makePosition(['Re1.1!', 'Ta1.1!', 'Cb1.1'], ['Re8.8']);
    expect(targetsFrom(blocked, 'e1.1')).not.toContain('c1.1');
  });

  it('non è permesso se re o torre si sono già mossi', () => {
    expect(targetsFrom(makePosition(['Re1.1', 'Ta1.1!', 'Th1.1!'], ['Re8.8']), 'e1.1')).not.toContain('g1.1');
    const pos = makePosition(['Re1.1!', 'Ta1.1!', 'Th1.1'], ['Re8.8']);
    expect(targetsFrom(pos, 'e1.1')).not.toContain('g1.1');
    expect(targetsFrom(pos, 'e1.1')).toContain('c1.1');
  });

  it('non è permesso sotto scacco o attraverso caselle attaccate', () => {
    const check = makePosition(['Re1.1!', 'Ta1.1!', 'Th1.1!'], ['Re8.8', 'Te5.1']);
    expect(movesFrom(check, 'e1.1').some((m) => moveFlag(m) === FLAG_CASTLE)).toBe(false);
    const through = makePosition(['Re1.1!', 'Ta1.1!', 'Th1.1!'], ['Re8.8', 'Tf5.1']);
    expect(targetsFrom(through, 'e1.1')).not.toContain('g1.1');
    expect(targetsFrom(through, 'e1.1')).toContain('c1.1');
    // Un attacco dalla verticale z sulla casella attraversata blocca l'arrocco.
    const fromAbove = makePosition(['Re1.1!', 'Ta1.1!', 'Th1.1!'], ['Re8.8', 'Td1.6']);
    expect(targetsFrom(fromAbove, 'e1.1')).not.toContain('c1.1');
    expect(targetsFrom(fromAbove, 'e1.1')).toContain('g1.1');
  });

  it('avviene solo lungo x, non tra livelli diversi', () => {
    const pos = makePosition(['Re1.1!', 'Te1.4!'], ['Re8.8']);
    expect(movesFrom(pos, 'e1.1').some((m) => moveFlag(m) === FLAG_CASTLE)).toBe(false);
  });
});

describe('Scacco, matto e stallo', () => {
  it('riconosce lo scacco e vieta le mosse che lasciano il re sotto scacco', () => {
    const pos = makePosition(['Re1.1', 'Ae2.1'], ['Re8.8', 'Te5.1']);
    expect(pos.inCheck()).toBe(false);
    // L'alfiere è inchiodato: muoverlo scopre il re.
    expect(targetsFrom(pos, 'e2.1')).toEqual([]);
    const check2 = makePosition(['Re1.1'], ['Re8.8', 'Dh4.4']);
    expect(check2.inCheck()).toBe(true); // diagonale e1.1 -> h4.4 sui tre assi
    expect(check2.status().state).toBe('ongoing');
  });

  it('scacco matto in un angolo del cubo', () => {
    const pos = makePosition(['Rc3.3', 'Db2.2'], ['Ra1.1'], BLACK);
    expect(pos.inCheck()).toBe(true);
    expect(pos.legalMoves()).toHaveLength(0);
    expect(pos.status()).toMatchObject({ state: 'checkmate', winner: 1 });
  });

  it('il re può sfuggire se il pezzo che dà scacco non è protetto', () => {
    const pos = makePosition(['Rh8.8', 'Db2.2'], ['Ra1.1'], BLACK);
    expect(pos.status().state).toBe('ongoing');
    expect(targetsFrom(pos, 'a1.1')).toEqual(['b2.2']);
  });

  it('stallo: nessuna mossa legale senza essere sotto scacco', () => {
    const pos = makePosition(['Ra1.3', 'Dc2.1'], ['Ra1.1'], BLACK);
    expect(pos.inCheck()).toBe(false);
    expect(pos.status()).toMatchObject({ state: 'stalemate' });
  });

  it('con due re ciascuno deve restare al sicuro', () => {
    const pos = makePosition(['Rb1.1', 'Ra1.8', 'Tb4.8'], ['Rh8.8', 'Dh1.8']);
    // Il re in a1.8 è sotto scacco lungo la traversa: va sistemato anche se l'altro è al sicuro.
    expect(pos.checkedKings().map((s) => s)).toEqual([sq('a1.8')]);
    for (const m of pos.legalMoves()) {
      pos.makeMove(m);
      expect(pos.inCheck(1)).toBe(false);
      pos.unmakeMove();
    }
    // La torre può solo interporsi sulla traversa dello scacco.
    expect(targetsFrom(pos, 'b4.8')).toEqual(['b1.8']);
  });
});

describe('Patte', () => {
  it('regola delle 50 mosse', () => {
    const pos = makePosition(['Ra1.1', 'Tb1.1'], ['Rh8.8', 'Tg8.8']);
    pos.halfmove = 99;
    pos.makeMove(parseMove(pos, 'Tb1.1 -> b2.1')!);
    expect(pos.status()).toMatchObject({ state: 'draw', reason: 'fifty-move' });
  });

  it('una cattura o una mossa di pedone azzera il contatore', () => {
    const pos = makePosition(['Ra1.1', 'b2.1'], ['Rh8.8', 'Tg8.8']);
    pos.halfmove = 99;
    pos.makeMove(parseMove(pos, 'b2.1 -> b3.1')!);
    expect(pos.halfmove).toBe(0);
    expect(pos.status().state).toBe('ongoing');
  });

  it('ripetizione tripla', () => {
    const pos = makePosition(['Ra1.1', 'Cb1.1', 'c2.1'], ['Rh8.8', 'Cg8.8', 'f7.8']);
    const cycle = ['Cb1.1 -> c3.1', 'Cg8.8 -> f6.8', 'Cc3.1 -> b1.1', 'Cf6.8 -> g8.8'];
    for (let rep = 0; rep < 2; rep++) {
      expect(pos.status().state).toBe('ongoing');
      for (const mv of cycle) pos.makeMove(parseMove(pos, mv)!);
    }
    expect(pos.repetitionCount()).toBe(3);
    expect(pos.status()).toMatchObject({ state: 'draw', reason: 'repetition' });
  });

  it('materiale insufficiente', () => {
    expect(makePosition(['Ra1.1'], ['Rh8.8']).status().reason).toBe('insufficient-material');
    expect(makePosition(['Ra1.1', 'Cb1.1'], ['Rh8.8']).status().reason).toBe('insufficient-material');
    // Alfieri tutti sullo stesso colore di cella.
    expect(makePosition(['Ra1.1', 'Ab1.2'], ['Rh8.8', 'Ac1.1']).status().reason).toBe('insufficient-material');
    expect(makePosition(['Ra1.1', 'Ab1.1'], ['Rh8.8', 'Ac1.1']).status().state).toBe('ongoing');
    expect(makePosition(['Ra1.1', 'Tb1.1'], ['Rh8.8']).status().state).toBe('ongoing');
    expect(makePosition(['Ra1.1', 'b2.1'], ['Rh8.8']).status().state).toBe('ongoing');
  });
});

describe('Game: notazione, annulla e ripeti', () => {
  it('scrive le mosse con tre componenti', () => {
    const g = new Game(DOUBLE_SET);
    const knight = parseMove(g.pos, 'Cb1.2 -> c3.2')!;
    expect(g.play(knight).notation).toBe('Cb1.2 -> c3.2');
    const pawn = parseMove(g.pos, 'e7.8 -> e5.8')!;
    expect(g.play(pawn).notation).toBe('e7.8 -> e5.8');
  });

  it('annulla e ripete ripristinando la posizione', () => {
    const g = new Game(DOUBLE_SET);
    const start = g.pos.key;
    g.play(parseMove(g.pos, 'Cb1.2 -> c3.2')!);
    const afterOne = g.pos.key;
    g.play(parseMove(g.pos, 'Cg8.7 -> f6.7')!);
    g.undo();
    expect(g.pos.key).toBe(afterOne);
    g.undo();
    expect(g.pos.key).toBe(start);
    expect(g.canUndo()).toBe(false);
    g.redo();
    g.redo();
    expect(g.played.map((p) => p.notation)).toEqual(['Cb1.2 -> c3.2', 'Cg8.7 -> f6.7']);
    expect(g.canRedo()).toBe(false);
  });

  it('una nuova mossa cancella la lista da ripetere', () => {
    const g = new Game(DOUBLE_SET);
    g.play(parseMove(g.pos, 'Cb1.2 -> c3.2')!);
    g.undo();
    g.play(parseMove(g.pos, 'a2.1 -> a3.1')!);
    expect(g.canRedo()).toBe(false);
  });

  it('rifiuta le mosse illegali', () => {
    const g = new Game(DOUBLE_SET);
    expect(() => g.play(parseSquare('a1.1') | (parseSquare('a5.1') << 9))).toThrow();
  });

  it('registra il pezzo catturato e segna scacco e matto', () => {
    const g = new Game(DOUBLE_SET);
    g.reset();
    g.pos = makePosition(['Rc3.3', 'Dh2.2'], ['Ra1.1', 'Cb2.1']);
    const rec = g.play(parseMove(g.pos, 'Dh2.2 -> b2.2')!);
    expect(rec.notation).toBe('Dh2.2 -> b2.2#');
    expect(g.status().state).toBe('checkmate');
    const cap = makePosition(['Ra1.1', 'Ca3.1'], ['Rh8.8', 'b5.1']);
    g.pos = cap;
    g.played = [];
    expect(g.play(parseMove(g.pos, 'Ca3.1 x b5.1')!).captured).toBe(-PAWN);
  });
});
