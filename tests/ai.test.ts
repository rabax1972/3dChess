import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, MATE, findBestMove } from '../src/engine/ai/search';
import { evaluate } from '../src/engine/ai/evaluate';
import { createInitialPosition, moveTo, parseSquare } from '../src/engine';
import { makePosition } from './helpers';

describe('valutazione', () => {
  it('lo schieramento iniziale simmetrico vale 0', () => {
    expect(evaluate(createInitialPosition())).toBe(0);
  });

  it('è dal punto di vista di chi muove', () => {
    const w = makePosition(['Ra1.1', 'Dd4.4'], ['Rh8.8']);
    const b = makePosition(['Ra1.1', 'Dd4.4'], ['Rh8.8'], -1);
    expect(evaluate(w)).toBeGreaterThan(1000);
    expect(evaluate(b)).toBe(-evaluate(w));
  });

  it('premia la centralità', () => {
    const center = makePosition(['Ra1.1', 'Cd4.4'], ['Rh8.8']);
    const corner = makePosition(['Ra1.1', 'Ch1.8'], ['Rh8.8']);
    expect(evaluate(center)).toBeGreaterThan(evaluate(corner));
  });
});

describe('ricerca alfa-beta', () => {
  it('trova il matto in una mossa', () => {
    const pos = makePosition(['Rc3.3', 'Dh2.2'], ['Ra1.1', 'Cb2.1']);
    const r = findBestMove(pos, { maxDepth: 2, timeMs: 10_000 });
    expect(r.score).toBeGreaterThan(MATE - 100);
    pos.makeMove(r.move!);
    expect(pos.status().state).toBe('checkmate');
  });

  it('cattura la regina indifesa', () => {
    const pos = makePosition(['Ra1.1', 'Td4.4'], ['Rh8.8', 'Dd4.8']);
    const r = findBestMove(pos, { maxDepth: 2, timeMs: 10_000 });
    expect(moveTo(r.move!)).toBe(parseSquare('d4.8'));
  });

  it('non cattura un pedone difeso con la regina', () => {
    // La regina può prendere e5.5 ma il pedone è difeso da e6.6 (cattura su z).
    const pos = makePosition(['Ra1.1', 'De1.5'], ['Rh8.8', 'e5.5', 'e6.6']);
    const r = findBestMove(pos, { maxDepth: 2, timeMs: 10_000 });
    expect(moveTo(r.move!)).not.toBe(parseSquare('e5.5'));
  });

  it('lascia la posizione intatta e restituisce una mossa legale', () => {
    const pos = createInitialPosition();
    const key = pos.key;
    const r = findBestMove(pos, { maxDepth: 2, timeMs: 10_000 });
    expect(pos.key).toBe(key);
    expect(pos.legalMoves()).toContain(r.move);
  });

  it('rispetta il limite di tempo', () => {
    const pos = createInitialPosition();
    const key = pos.key;
    const r = findBestMove(pos, { maxDepth: 6, timeMs: 400 });
    expect(pos.key).toBe(key); // l'interruzione annulla le mosse rimaste a metà
    expect(r.timeMs).toBeLessThan(1500);
    expect(r.depth).toBeGreaterThanOrEqual(1);
    expect(pos.legalMoves()).toContain(r.move);
  });

  it('i livelli di difficoltà sono crescenti', () => {
    const depths = DIFFICULTIES.map((d) => d.options.maxDepth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it('restituisce null senza mosse legali', () => {
    const pos = makePosition(['Ra1.3', 'Dc2.1'], ['Ra1.1'], -1);
    expect(findBestMove(pos, { maxDepth: 2, timeMs: 1000 }).move).toBeNull();
  });
});
