/**
 * Generatore di mosse di riferimento, scritto in modo volutamente ingenuo
 * (coordinate esplicite, nessuna tabella precalcolata, copia della scacchiera a
 * ogni mossa). Serve solo nei test per verificare il generatore veloce.
 */
import { CELLS, fileOf, levelOf, rankOf, type Position } from '../src/engine';

type V = [number, number, number];
interface Cell {
  t: number; // 1 pedone ... 6 re
  c: number; // 1 bianco, -1 nero
  v: boolean; // mai mosso
}
interface State {
  cells: (Cell | null)[];
  side: number;
  /** Casella scavalcata dal doppio passo e casella del pedone che lo ha fatto. */
  ep: { target: V; victim: V } | null;
}

const N = 8;
const id = (x: number, y: number, z: number) => x + y * N + z * N * N;
const inside = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N;

const ALL: V[] = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) ALL.push([a, b, c]);
const nz = (v: V) => v.filter((k) => k !== 0).length;
const ROOK = ALL.filter((v) => nz(v) === 1);
const BISHOP = ALL.filter((v) => nz(v) === 2);
const KNIGHT: V[] = [];
for (const a of [-2, -1, 0, 1, 2]) for (const b of [-2, -1, 0, 1, 2]) for (const c of [-2, -1, 0, 1, 2]) {
  const s = [a, b, c].map(Math.abs).sort().join();
  if (s === '0,1,2') KNIGHT.push([a, b, c]);
}

export function stateFrom(pos: Position): State {
  const cells: (Cell | null)[] = [];
  for (let s = 0; s < CELLS; s++) {
    const p = pos.board[s];
    cells.push(p ? { t: Math.abs(p), c: Math.sign(p), v: pos.virgin[s] === 1 } : null);
  }
  const v = (s: number): V => [fileOf(s), rankOf(s), levelOf(s)];
  return { cells, side: pos.side, ep: pos.ep >= 0 ? { target: v(pos.ep), victim: v(pos.epVictim) } : null };
}

const at = (st: State, x: number, y: number, z: number) => st.cells[id(x, y, z)];

function attacked(st: State, x: number, y: number, z: number, by: number): boolean {
  for (const [dx, dy, dz] of ALL) {
    for (let k = 1; ; k++) {
      const X = x + dx * k, Y = y + dy * k, Z = z + dz * k;
      if (!inside(X, Y, Z)) break;
      const p = at(st, X, Y, Z);
      if (!p) continue;
      if (p.c === by) {
        const kind = nz([dx, dy, dz]);
        if (p.t === 5) return true;
        if (p.t === 4 && kind === 1) return true;
        if (p.t === 3 && kind === 2) return true;
        if (p.t === 6 && k === 1) return true;
      }
      break;
    }
  }
  for (const [dx, dy, dz] of KNIGHT) {
    const X = x + dx, Y = y + dy, Z = z + dz;
    if (inside(X, Y, Z) && at(st, X, Y, Z)?.c === by && at(st, X, Y, Z)?.t === 2) return true;
  }
  // Un pedone di `by` in (X, y - by, Z) cattura (x, y, z).
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const X = x + dx, Y = y - by, Z = z + dz;
    if (inside(X, Y, Z) && at(st, X, Y, Z)?.c === by && at(st, X, Y, Z)?.t === 1) return true;
  }
  return false;
}

interface RefMove {
  from: V;
  to: V;
  promo: number;
  ep?: V; // pedone catturato en passant
  castleRook?: V;
  double?: boolean;
}

function pseudo(st: State): RefMove[] {
  const out: RefMove[] = [];
  const us = st.side;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = at(st, x, y, z);
    if (!p || p.c !== us) continue;
    const from: V = [x, y, z];
    const slide = (vecs: V[], max: number) => {
      for (const [dx, dy, dz] of vecs)
        for (let k = 1; k <= max; k++) {
          const X = x + dx * k, Y = y + dy * k, Z = z + dz * k;
          if (!inside(X, Y, Z)) break;
          const q = at(st, X, Y, Z);
          if (q && q.c === us) break;
          out.push({ from, to: [X, Y, Z], promo: 0 });
          if (q) break;
        }
    };
    if (p.t === 4) slide(ROOK, N);
    if (p.t === 3) slide(BISHOP, N);
    if (p.t === 5) slide(ALL, N);
    if (p.t === 6) slide(ALL, 1);
    if (p.t === 2) slide(KNIGHT, 1);
    if (p.t === 1) {
      const last = us === 1 ? N - 1 : 0;
      const add = (to: V, extra: Partial<RefMove> = {}) => {
        if (to[1] === last) for (const pr of [5, 4, 3, 2]) out.push({ from, to, promo: pr, ...extra });
        else out.push({ from, to, promo: 0, ...extra });
      };
      const Y = y + us;
      if (inside(x, Y, z) && !at(st, x, Y, z)) {
        add([x, Y, z]);
        if (p.v && inside(x, Y + us, z) && !at(st, x, Y + us, z)) add([x, Y + us, z], { double: true });
      }
      // Passo verticale (su o giù), doppio alla prima mossa.
      for (const dz of [1, -1]) {
        if (!inside(x, y, z + dz) || at(st, x, y, z + dz)) continue;
        out.push({ from, to: [x, y, z + dz], promo: 0 });
        if (p.v && inside(x, y, z + 2 * dz) && !at(st, x, y, z + 2 * dz))
          out.push({ from, to: [x, y, z + 2 * dz], promo: 0, double: true });
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Z = z + dz;
        if (!inside(X, Y, Z)) continue;
        const q = at(st, X, Y, Z);
        if (q && q.c !== us) add([X, Y, Z]);
        else if (!q && st.ep && st.ep.target.join() === [X, Y, Z].join()) add([X, Y, Z], { ep: st.ep.victim });
      }
    }
    if (p.t === 6 && p.v && !attacked(st, x, y, z, -us)) {
      for (const dir of [-1, 1]) {
        for (let k = 1; inside(x + dir * k, y, z); k++) {
          const q = at(st, x + dir * k, y, z);
          if (!q) continue;
          if (q.t === 4 && q.c === us && q.v && k >= 3 &&
            !attacked(st, x + dir, y, z, -us) && !attacked(st, x + 2 * dir, y, z, -us))
            out.push({ from, to: [x + 2 * dir, y, z], promo: 0, castleRook: [x + dir * k, y, z] });
          break;
        }
      }
    }
  }
  return out;
}

function apply(st: State, m: RefMove): State {
  const cells = st.cells.map((c) => (c ? { ...c } : null));
  const [fx, fy, fz] = m.from, [tx, ty, tz] = m.to;
  const piece = cells[id(fx, fy, fz)]!;
  cells[id(fx, fy, fz)] = null;
  if (m.ep) cells[id(m.ep[0], m.ep[1], m.ep[2])] = null;
  cells[id(tx, ty, tz)] = { t: m.promo || piece.t, c: piece.c, v: false };
  if (m.castleRook) {
    const [rx, ry, rz] = m.castleRook;
    cells[id(rx, ry, rz)] = null;
    cells[id(fx + Math.sign(tx - fx), fy, fz)] = { t: 4, c: piece.c, v: false };
  }
  const mid: V = [(fx + tx) / 2, (fy + ty) / 2, (fz + tz) / 2];
  return { cells, side: -st.side, ep: m.double ? { target: mid, victim: [tx, ty, tz] } : null };
}

function kingsSafe(st: State, color: number): boolean {
  for (let s = 0; s < CELLS; s++) {
    const p = st.cells[s];
    if (p && p.t === 6 && p.c === color && attacked(st, s % N, Math.floor(s / N) % N, Math.floor(s / (N * N)), -color))
      return false;
  }
  return true;
}

export function referenceLegal(st: State): { key: string; next: State }[] {
  return pseudo(st)
    .map((m) => ({ key: `${m.from.join()}>${m.to.join()}=${m.promo}`, next: apply(st, m) }))
    .filter(({ next }) => kingsSafe(next, st.side));
}

export function referencePerft(st: State, depth: number): number {
  if (depth === 0) return 1;
  const moves = referenceLegal(st);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + referencePerft(m.next, depth - 1), 0);
}
