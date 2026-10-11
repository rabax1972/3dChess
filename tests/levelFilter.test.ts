import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER, levelVisibility, normalizeFilter, shiftFilter } from '../src/ui/levelFilter';

describe('filtro livelli', () => {
  it('mostra tutti i livelli per default', () => {
    expect(levelVisibility(DEFAULT_FILTER)).toEqual(Array(8).fill('active'));
  });

  it('un solo livello, gli altri attenuati o nascosti', () => {
    const v = levelVisibility({ ...DEFAULT_FILTER, mode: 'single', single: 3 });
    expect(v[2]).toBe('active');
    expect(v.filter((x) => x === 'dimmed')).toHaveLength(7);
    const h = levelVisibility({ ...DEFAULT_FILTER, mode: 'single', single: 3, dimOthers: false });
    expect(h.filter((x) => x === 'hidden')).toHaveLength(7);
  });

  it('intervallo, anche con estremi invertiti', () => {
    const v = levelVisibility({ ...DEFAULT_FILTER, mode: 'range', from: 6, to: 4, dimOthers: false });
    expect(v).toEqual(['hidden', 'hidden', 'hidden', 'active', 'active', 'active', 'hidden', 'hidden']);
  });

  it('limita i valori e sposta la selezione', () => {
    expect(normalizeFilter({ ...DEFAULT_FILTER, single: 12 }).single).toBe(8);
    expect(shiftFilter({ ...DEFAULT_FILTER, mode: 'single', single: 8 }, 1).single).toBe(8);
    const r = shiftFilter({ ...DEFAULT_FILTER, mode: 'range', from: 6, to: 8 }, 1);
    expect([r.from, r.to]).toEqual([6, 8]);
    const r2 = shiftFilter({ ...DEFAULT_FILTER, mode: 'range', from: 2, to: 4 }, -3);
    expect([r2.from, r2.to]).toEqual([1, 3]);
  });
});
