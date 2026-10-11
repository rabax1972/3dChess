import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, type PieceType } from '../engine/types';

/**
 * Geometrie procedurali dei pezzi (nessun asset esterno): profili ruotati
 * (LatheGeometry) più qualche dettaglio — merli della torre, corona della regina,
 * croce del re, testa estrusa del cavallo. Altezza massima ~0.85 unità di cella.
 */

const SEGMENTS = 28;
type Profile = [number, number][];

const lathe = (profile: Profile) =>
  new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    SEGMENTS,
  );

/** Piedistallo comune a tutti i pezzi. */
const BASE: Profile = [
  [0, 0],
  [0.31, 0],
  [0.31, 0.045],
  [0.27, 0.075],
  [0.24, 0.095],
  [0.2, 0.11],
];

const sphere = (r: number, y: number, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.SphereGeometry(r, 20, 14);
  g.scale(sx, sy, sz);
  g.translate(0, y, 0);
  return g;
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const torus = (r: number, tube: number, y: number) => {
  const g = new THREE.TorusGeometry(r, tube, 10, SEGMENTS);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
};

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ng.getAttribute('position').count) * 2), 2));
    return ng;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Impossibile unire le geometrie del pezzo');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function pawn() {
  return merge([
    lathe([...BASE, [0.15, 0.16], [0.1, 0.3], [0.085, 0.36], [0.15, 0.38], [0.15, 0.4], [0.07, 0.43], [0, 0.43]]),
    sphere(0.125, 0.52),
  ]);
}

function rook() {
  const parts: THREE.BufferGeometry[] = [
    lathe([...BASE, [0.19, 0.16], [0.17, 0.48], [0.22, 0.5], [0.22, 0.62], [0.16, 0.62], [0.16, 0.58], [0, 0.58]]),
  ];
  const merlons = 6;
  for (let i = 0; i < merlons; i++) {
    const a = (i / merlons) * Math.PI * 2;
    const g = box(0.08, 0.09, 0.07, 0, 0.665, 0);
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0.185, 0, 0));
    g.applyMatrix4(m);
    parts.push(g);
  }
  return merge(parts);
}

function bishop() {
  return merge([
    lathe([...BASE, [0.16, 0.16], [0.1, 0.4], [0.16, 0.42], [0.16, 0.45], [0.09, 0.47], [0, 0.47]]),
    sphere(0.13, 0.6, 1, 1.35, 1),
    torus(0.105, 0.02, 0.5),
    sphere(0.04, 0.8),
  ]);
}

function queen() {
  const parts: THREE.BufferGeometry[] = [
    lathe([...BASE, [0.18, 0.16], [0.11, 0.48], [0.18, 0.51], [0.18, 0.54], [0.12, 0.56], [0.19, 0.7], [0.13, 0.7], [0.08, 0.66], [0, 0.66]]),
    sphere(0.06, 0.76),
  ];
  const points = 8;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const g = sphere(0.032, 0.71);
    g.translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
    parts.push(g);
  }
  return merge(parts);
}

function king() {
  return merge([
    lathe([...BASE, [0.19, 0.16], [0.12, 0.5], [0.19, 0.53], [0.19, 0.56], [0.13, 0.58], [0.17, 0.7], [0, 0.72]]),
    box(0.06, 0.2, 0.06, 0, 0.8, 0),
    box(0.18, 0.06, 0.06, 0, 0.82, 0),
  ]);
}

function knight() {
  // Profilo della testa del cavallo, estruso; il muso guarda verso -Z (avanti per il Bianco).
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [-0.14, 0.12], [0.16, 0.12], [0.15, 0.3], [0.12, 0.45], [0.06, 0.6], [0.02, 0.72],
    [-0.04, 0.66], [-0.12, 0.62], [-0.26, 0.52], [-0.29, 0.44], [-0.24, 0.4], [-0.12, 0.44],
    [-0.04, 0.36], [-0.14, 0.24],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  const head = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  head.translate(0, 0, -0.08);
  head.rotateY(-Math.PI / 2); // il muso (x negativo) ruota verso -Z
  return merge([lathe([...BASE, [0.18, 0.15], [0, 0.15]]), head]);
}

const BUILDERS: Record<PieceType, () => THREE.BufferGeometry> = {
  [PAWN]: pawn,
  [KNIGHT]: knight,
  [BISHOP]: bishop,
  [ROOK]: rook,
  [QUEEN]: queen,
  [KING]: king,
};

const cache = new Map<PieceType, THREE.BufferGeometry>();

export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = cache.get(type);
  if (!g) {
    g = BUILDERS[type]();
    cache.set(type, g);
  }
  return g;
}
