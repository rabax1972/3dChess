import { SIZE } from '../engine/types';

/**
 * Filtro dei livelli visibili. Logica pura, condivisa da UI e rendering.
 * Livelli 1-based come nell'interfaccia.
 */
export type LevelMode = 'all' | 'single' | 'range';
export type LevelVisibility = 'active' | 'dimmed' | 'hidden';

export interface LevelFilter {
  mode: LevelMode;
  single: number;
  from: number;
  to: number;
  /** Se true i livelli non selezionati restano visibili ma attenuati, altrimenti sono nascosti. */
  dimOthers: boolean;
}

export const DEFAULT_FILTER: LevelFilter = { mode: 'all', single: 1, from: 1, to: SIZE, dimOthers: true };

const clampLevel = (n: number) => Math.min(SIZE, Math.max(1, Math.round(n)));

export function normalizeFilter(f: LevelFilter): LevelFilter {
  const a = clampLevel(f.from), b = clampLevel(f.to);
  return { ...f, single: clampLevel(f.single), from: Math.min(a, b), to: Math.max(a, b) };
}

export function isLevelSelected(f: LevelFilter, level: number): boolean {
  const n = normalizeFilter(f);
  switch (n.mode) {
    case 'all':
      return true;
    case 'single':
      return level === n.single;
    case 'range':
      return level >= n.from && level <= n.to;
  }
}

/** Visibilità di ciascun livello (indice 0 = livello 1). */
export function levelVisibility(f: LevelFilter): LevelVisibility[] {
  return Array.from({ length: SIZE }, (_, i) =>
    isLevelSelected(f, i + 1) ? 'active' : f.dimOthers ? 'dimmed' : 'hidden',
  );
}

/** Sposta la selezione di `delta` livelli (frecce su/giù), mantenendo l'ampiezza dell'intervallo. */
export function shiftFilter(f: LevelFilter, delta: number): LevelFilter {
  const n = normalizeFilter(f);
  if (n.mode === 'single') return { ...n, single: clampLevel(n.single + delta) };
  if (n.mode === 'range') {
    const width = n.to - n.from;
    const from = Math.min(SIZE - width, Math.max(1, n.from + delta));
    return { ...n, from, to: from + width };
  }
  return n;
}
