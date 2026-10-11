import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FILES } from '../engine/notation';
import { CELLS, PLANE, SIZE, WHITE, levelOf, type Color, type PieceType } from '../engine/types';
import type { LevelVisibility } from '../ui/levelFilter';
import { BOARD_EXTENT, CUBE_HEIGHT, LEVEL_SPACING, TILE_SIZE, TILE_THICKNESS, cellFloor, levelFloor, worldX, worldZ } from './layout';
import { pieceGeometry } from './pieceGeometry';
import { textSprite } from './text';
import { THEME } from './theme';

export interface MoveTarget {
  square: number;
  capture: boolean;
}

/** Descrizione grafica di una mossa da animare. */
export interface MoveAnimation {
  from: number;
  to: number;
  capturedSquare: number;
  rookFrom?: number;
  rookTo?: number;
}

type PieceStyle = 'normal' | 'dim' | 'selected' | 'check';

interface Tween {
  start: number;
  duration: number;
  update: (t: number) => void;
  done: () => void;
}

const MOVE_MS = 320;
/** Raggio della sfera da inquadrare: cubo più frecce ed etichette degli assi. */
const FIT_RADIUS = 8.4;
const CAPTURE_MS = 260;
const ARC_HEIGHT = 0.6;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Vista 3D della scacchiera. Non conosce le regole: riceve lo stato della
 * scacchiera (array di pezzi) e le evidenziazioni, ed emette click sulle celle.
 */
export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  /** Chiamata quando l'utente fa click su una cella (non durante un trascinamento). */
  onCellClick?: (square: number) => void;
  /** Ritorna true se la cella è interattiva (per il cursore e l'evidenziazione al passaggio). */
  isInteractive?: (square: number) => boolean;

  private pieces = new Map<number, THREE.Mesh>();
  private piecesGroup = new THREE.Group();
  private markers = new THREE.Group();
  private tiles: THREE.InstancedMesh[] = [];
  private tileMaterials: THREE.MeshStandardMaterial[] = [];
  private frames: THREE.LineSegments[] = [];
  private labelPlanes: THREE.Mesh[] = [];
  private edgeLabels = new THREE.Group();
  private axes = new THREE.Group();
  private visibility: LevelVisibility[] = Array(SIZE).fill('active');
  private selected: number | null = null;
  private targets: MoveTarget[] = [];
  private checked: number[] = [];
  private lastMove: [number, number] | null = null;
  private hovered: number | null = null;
  private tweens: Tween[] = [];
  private materials: Record<'w' | 'b', Record<PieceStyle, THREE.MeshStandardMaterial>>;
  private markerMaterials: Record<'quiet' | 'capture' | 'selected', THREE.MeshBasicMaterial>;
  private markerGeoms = {
    quiet: new THREE.SphereGeometry(0.11, 16, 12),
    capture: new THREE.TorusGeometry(0.36, 0.035, 8, 40).rotateX(Math.PI / 2),
    selected: new THREE.TorusGeometry(0.4, 0.03, 8, 40).rotateX(Math.PI / 2),
  };
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt: { x: number; y: number } | null = null;
  private orientation: Color = WHITE;
  private resizeObserver: ResizeObserver;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(THEME.background);
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(THEME.fog, 28, 60);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 45;
    this.controls.screenSpacePanning = true;

    this.materials = {
      w: this.makePieceMaterials(THEME.whitePiece),
      b: this.makePieceMaterials(THEME.blackPiece),
    };
    const basic = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    this.markerMaterials = { quiet: basic(THEME.quiet), capture: basic(THEME.capture), selected: basic(THEME.selected) };

    this.addLights();
    this.buildTiles();
    this.buildFrames();
    this.buildLabels();
    this.buildAxes();
    this.scene.add(this.piecesGroup, this.markers);

    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.resetCamera();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  // ------------------------------------------------------------------ costruzione scena

  private makePieceMaterials(color: number): Record<PieceStyle, THREE.MeshStandardMaterial> {
    const base = { color, roughness: 0.42, metalness: 0.08 };
    return {
      normal: new THREE.MeshStandardMaterial(base),
      dim: new THREE.MeshStandardMaterial({ ...base, transparent: true, opacity: THEME.pieceDimOpacity, depthWrite: false }),
      selected: new THREE.MeshStandardMaterial({ ...base, emissive: THEME.selected, emissiveIntensity: 0.45 }),
      check: new THREE.MeshStandardMaterial({ ...base, emissive: THEME.check, emissiveIntensity: 0.7 }),
    };
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x1a1f2b, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 14, 9);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-8, 4, -10);
    this.scene.add(key, rim);
  }

  private buildTiles() {
    const geom = new THREE.BoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE);
    const m = new THREE.Matrix4();
    for (let z = 0; z < SIZE; z++) {
      const mat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: THEME.tileOpacity,
        depthWrite: false,
        roughness: 0.8,
      });
      const mesh = new THREE.InstancedMesh(geom, mat, PLANE);
      mesh.userData.level = z;
      for (let i = 0; i < PLANE; i++) {
        const x = i % SIZE, y = Math.floor(i / SIZE);
        m.makeTranslation(worldX(x), levelFloor(z) - TILE_THICKNESS / 2, worldZ(y));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color());
      }
      mesh.renderOrder = 0;
      this.tiles.push(mesh);
      this.tileMaterials.push(mat);
      this.scene.add(mesh);
    }
    this.refreshTileColors();
  }

  /** Griglia di ogni livello: bordo esterno e linee tra le celle. */
  private buildFrames() {
    const pts: number[] = [];
    const h = BOARD_EXTENT / 2;
    for (let i = 0; i <= SIZE; i++) {
      const t = -h + (i * BOARD_EXTENT) / SIZE;
      pts.push(t, 0, -h, t, 0, h, -h, 0, t, h, 0, t);
    }
    const levelEdges = new THREE.BufferGeometry();
    levelEdges.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    for (let z = 0; z < SIZE; z++) {
      const mat = new THREE.LineBasicMaterial({ color: THEME.frame, transparent: true, opacity: THEME.frameOpacity });
      const lines = new THREE.LineSegments(levelEdges, mat);
      lines.position.set(0, levelFloor(z), 0);
      this.frames.push(lines);
      this.scene.add(lines);
    }
    const bottom = levelFloor(0), top = levelFloor(SIZE - 1) + LEVEL_SPACING * 0.75;
    const cube = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(BOARD_EXTENT, top - bottom, BOARD_EXTENT)),
      new THREE.LineBasicMaterial({ color: THEME.frame, transparent: true, opacity: 0.25 }),
    );
    cube.position.y = (top + bottom) / 2;
    this.scene.add(cube);
  }

  /** Un piano per livello con le coordinate disegnate in un angolo di ogni cella. */
  private buildLabels() {
    const px = 128;
    for (let z = 0; z < SIZE; z++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px * SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '600 25px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textBaseline = 'top';
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const text = `${FILES[x]}${y + 1}.${z + 1}`;
          const cx = x * px + 10, cy = (SIZE - 1 - y) * px + 8;
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(8, 12, 22, 0.75)';
          ctx.strokeText(text, cx, cy);
          ctx.fillStyle = THEME.label;
          ctx.fillText(text, cx, cy);
        }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD_EXTENT, BOARD_EXTENT).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      plane.position.y = levelFloor(z) + 0.004;
      plane.renderOrder = 1;
      plane.visible = false;
      this.labelPlanes.push(plane);
      this.scene.add(plane);
    }
    // Etichette sui bordi: colonne, traverse e livelli.
    const edge = (BOARD_EXTENT / 2) + 0.55;
    for (let i = 0; i < SIZE; i++) {
      const f = textSprite(FILES[i], THEME.label, 0.42);
      f.position.set(worldX(i), levelFloor(0) - 0.05, edge);
      const r = textSprite(String(i + 1), THEME.label, 0.42);
      r.position.set(-edge, levelFloor(0) - 0.05, worldZ(i));
      const l = textSprite(`L${i + 1}`, THEME.label, 0.4);
      l.position.set(-edge, levelFloor(i) + 0.05, edge);
      this.edgeLabels.add(f, r, l);
    }
    this.edgeLabels.visible = false;
    this.scene.add(this.edgeLabels);
  }

  /** Frecce degli assi con le etichette (colonne, traverse, livelli). */
  private buildAxes() {
    const origin = new THREE.Vector3(-BOARD_EXTENT / 2 - 0.9, levelFloor(0), BOARD_EXTENT / 2 + 0.9);
    const len = BOARD_EXTENT + 0.6;
    const defs: [THREE.Vector3, number, number, string, string][] = [
      [new THREE.Vector3(1, 0, 0), THEME.axisX, len, 'x · colonne a→h', '#ff8787'],
      [new THREE.Vector3(0, 0, -1), THEME.axisY, len, 'y · traverse 1→8', '#69db7c'],
      [new THREE.Vector3(0, 1, 0), THEME.axisZ, CUBE_HEIGHT, 'z · livelli 1→8', '#74c0fc'],
    ];
    for (const [dir, color, length, text, css] of defs) {
      this.axes.add(new THREE.ArrowHelper(dir, origin, length, color, 0.35, 0.18));
      const label = textSprite(text, css, 0.38);
      label.position.copy(origin).addScaledVector(dir, length + 0.6);
      this.axes.add(label);
    }
    this.scene.add(this.axes);
  }

  // ------------------------------------------------------------------ API pubblica

  /** Allinea i pezzi alla scacchiera data, senza animazione. */
  setBoard(board: Int8Array) {
    for (let s = 0; s < CELLS; s++) {
      const want = board[s];
      const mesh = this.pieces.get(s);
      if (mesh && mesh.userData.piece === want) continue;
      if (mesh) this.removePiece(s);
      if (want !== 0) this.addPiece(s, want);
    }
    this.refreshPieceStyles();
  }

  /** Anima una mossa, poi allinea lo stato alla scacchiera finale (promozioni comprese). */
  animateMove(anim: MoveAnimation, boardAfter: Int8Array): Promise<void> {
    const jobs: Promise<void>[] = [];
    if (anim.capturedSquare >= 0 && anim.capturedSquare !== anim.from) {
      const victim = this.pieces.get(anim.capturedSquare);
      if (victim) {
        this.pieces.delete(anim.capturedSquare);
        jobs.push(this.fadeOut(victim));
      }
    }
    jobs.push(this.slide(anim.from, anim.to));
    if (anim.rookFrom !== undefined && anim.rookTo !== undefined) jobs.push(this.slide(anim.rookFrom, anim.rookTo));
    return Promise.all(jobs).then(() => this.setBoard(boardAfter));
  }

  setSelection(square: number | null, targets: MoveTarget[]) {
    this.selected = square;
    this.targets = targets;
    this.rebuildMarkers();
    this.refreshTileColors();
    this.refreshPieceStyles();
  }

  setChecked(squares: number[]) {
    this.checked = squares;
    this.refreshTileColors();
    this.refreshPieceStyles();
  }

  setLastMove(move: [number, number] | null) {
    this.lastMove = move;
    this.refreshTileColors();
  }

  setLevelVisibility(v: LevelVisibility[]) {
    this.visibility = v;
    for (let z = 0; z < SIZE; z++) {
      const state = v[z];
      this.tiles[z].visible = state !== 'hidden';
      this.tileMaterials[z].opacity = state === 'active' ? THEME.tileOpacity : THEME.tileOpacityDim;
      this.frames[z].visible = state !== 'hidden';
      (this.frames[z].material as THREE.LineBasicMaterial).opacity =
        state === 'active' ? THEME.frameOpacity : THEME.frameOpacityDim;
    }
    this.refreshLabels();
    this.refreshPieceStyles();
    this.rebuildMarkers();
  }

  private labelsOn = false;
  setLabelsVisible(on: boolean) {
    this.labelsOn = on;
    this.refreshLabels();
  }

  setAxesVisible(on: boolean) {
    this.axes.visible = on;
  }

  /** Riporta la camera alla vista di partenza, dal lato del colore indicato. */
  resetCamera(side: Color = this.orientation) {
    this.orientation = side;
    const sign = side === WHITE ? 1 : -1;
    // Distanza che fa entrare tutto il cubo (sfera di raggio FIT_RADIUS) nel campo visivo più stretto.
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = FIT_RADIUS / Math.sin(Math.min(vFov, hFov) / 2);
    const dir = new THREE.Vector3(0.38 * sign, 0.5, 0.78 * sign).normalize();
    this.controls.target.set(0, 0.2, 0);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  /** Inquadra un livello dall'alto in diagonale (usato dal filtro "un solo livello"). */
  focusLevel(level: number | null) {
    const y = level === null ? -0.6 : levelFloor(level - 1) + 0.3;
    const delta = y - this.controls.target.y;
    this.controls.target.y += delta;
    this.camera.position.y += delta;
    this.controls.update();
  }

  /** Coordinate in pixel (relative alla pagina) del centro di una cella, per test e tooltip. */
  projectSquare(s: number): { x: number; y: number } {
    const [x, y, z] = cellFloor(s);
    const v = new THREE.Vector3(x, y + 0.3, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ pezzi

  private addPiece(s: number, piece: number) {
    const type = Math.abs(piece) as PieceType;
    const mesh = new THREE.Mesh(pieceGeometry(type), this.materials[piece > 0 ? 'w' : 'b'].normal);
    mesh.position.set(...cellFloor(s));
    if (piece < 0) mesh.rotation.y = Math.PI; // il cavallo nero guarda verso il Bianco
    mesh.userData = { square: s, piece };
    mesh.renderOrder = 2;
    this.pieces.set(s, mesh);
    this.piecesGroup.add(mesh);
  }

  private removePiece(s: number) {
    const mesh = this.pieces.get(s);
    if (!mesh) return;
    this.piecesGroup.remove(mesh);
    this.pieces.delete(s);
  }

  private pieceStyle(s: number): PieceStyle {
    const vis = this.visibility[levelOf(s)];
    if (s === this.selected) return 'selected';
    if (this.checked.includes(s)) return 'check';
    return vis === 'active' ? 'normal' : 'dim';
  }

  private refreshPieceStyles() {
    for (const [s, mesh] of this.pieces) {
      const vis = this.visibility[levelOf(s)];
      mesh.visible = vis !== 'hidden' || s === this.selected;
      const piece = mesh.userData.piece as number;
      mesh.material = this.materials[piece > 0 ? 'w' : 'b'][this.pieceStyle(s)];
    }
  }

  private slide(from: number, to: number): Promise<void> {
    const mesh = this.pieces.get(from);
    if (!mesh) return Promise.resolve();
    this.pieces.delete(from);
    this.pieces.set(to, mesh);
    mesh.userData.square = to;
    const a = new THREE.Vector3(...cellFloor(from));
    const b = new THREE.Vector3(...cellFloor(to));
    const lift = ARC_HEIGHT + Math.abs(b.y - a.y) * 0.25;
    return this.tween(MOVE_MS, (t) => {
      const e = easeInOut(t);
      mesh.position.lerpVectors(a, b, e);
      mesh.position.y += Math.sin(Math.PI * e) * lift;
    });
  }

  private fadeOut(mesh: THREE.Mesh): Promise<void> {
    const startScale = mesh.scale.x;
    return this.tween(CAPTURE_MS, (t) => {
      const k = startScale * (1 - t);
      mesh.scale.set(k, k, k);
      mesh.position.y += 0.01;
    }).then(() => {
      this.piecesGroup.remove(mesh);
    });
  }

  private tween(duration: number, update: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), duration, update, done: resolve });
    });
  }

  // ------------------------------------------------------------------ evidenziazioni

  private rebuildMarkers() {
    this.markers.clear();
    const add = (kind: 'quiet' | 'capture' | 'selected', s: number, yOffset: number) => {
      const state = this.visibility[levelOf(s)];
      if (state === 'hidden' && kind !== 'selected') return;
      const mat = this.markerMaterials[kind];
      const mesh = new THREE.Mesh(this.markerGeoms[kind], mat);
      const [x, y, z] = cellFloor(s);
      mesh.position.set(x, y + yOffset, z);
      mesh.userData.square = s;
      mesh.renderOrder = 3;
      this.markers.add(mesh);
    };
    if (this.selected !== null) add('selected', this.selected, 0.02);
    for (const t of this.targets) add(t.capture ? 'capture' : 'quiet', t.square, t.capture ? 0.04 : 0.3);
  }

  private refreshTileColors() {
    const c = new THREE.Color();
    const targetMap = new Map(this.targets.map((t) => [t.square, t.capture]));
    for (let z = 0; z < SIZE; z++) {
      const mesh = this.tiles[z];
      for (let i = 0; i < PLANE; i++) {
        const s = z * PLANE + i;
        const x = i % SIZE, y = Math.floor(i / SIZE);
        c.set((x + y + z) % 2 === 0 ? THEME.tileDark : THEME.tileLight);
        if (this.lastMove && (this.lastMove[0] === s || this.lastMove[1] === s)) c.lerp(new THREE.Color(THEME.lastMove), 0.75);
        if (targetMap.has(s)) c.set(targetMap.get(s) ? THEME.capture : THEME.quiet);
        if (s === this.selected) c.set(THEME.selected);
        if (this.checked.includes(s)) c.set(THEME.check);
        if (s === this.hovered) c.lerp(new THREE.Color(THEME.hover), 0.5);
        mesh.setColorAt(i, c);
      }
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  private refreshLabels() {
    for (let z = 0; z < SIZE; z++) this.labelPlanes[z].visible = this.labelsOn && this.visibility[z] === 'active';
    this.edgeLabels.visible = this.labelsOn;
  }

  // ------------------------------------------------------------------ input

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.downAt) return;
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      this.downAt = null;
      if (moved > 6) return;
      const sq = this.pick(e);
      if (sq !== null) this.onCellClick?.(sq);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
      const sq = this.pick(e);
      const interactive = sq !== null && (this.isInteractive?.(sq) ?? false);
      el.style.cursor = interactive ? 'pointer' : 'grab';
      const hovered = interactive ? sq : null;
      if (hovered !== this.hovered) {
        this.hovered = hovered;
        this.refreshTileColors();
      }
    });
    el.addEventListener('pointerleave', () => {
      if (this.hovered !== null) {
        this.hovered = null;
        this.refreshTileColors();
      }
    });
  }

  /** Cella sotto il puntatore. Priorità: marcatori, poi pezzi, poi celle dei livelli attivi. */
  private pick(e: PointerEvent): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // I mesh aggiunti dopo l'ultimo frame non hanno ancora la matrice mondo aggiornata.
    this.scene.updateMatrixWorld();

    const markerHit = this.raycaster.intersectObjects(this.markers.children, false)[0];
    if (markerHit) return markerHit.object.userData.square as number;

    const activePieces = [...this.pieces.values()].filter(
      (m) => m.visible && this.visibility[levelOf(m.userData.square)] === 'active',
    );
    const pieceHit = this.raycaster.intersectObjects(activePieces, false)[0];
    if (pieceHit) return pieceHit.object.userData.square as number;

    const activeTiles = this.tiles.filter((t) => this.visibility[t.userData.level] === 'active');
    const tileHit = this.raycaster.intersectObjects(activeTiles, false)[0];
    if (tileHit && tileHit.instanceId !== undefined)
      return (tileHit.object.userData.level as number) * PLANE + tileHit.instanceId;
    return null;
  }

  // ------------------------------------------------------------------ ciclo di rendering

  private resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Su schermi stretti allarga il campo visivo per far entrare tutto il cubo.
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  private tick(now: number) {
    if (this.tweens.length) {
      const still: Tween[] = [];
      for (const tw of this.tweens) {
        const t = Math.min(1, (now - tw.start) / tw.duration);
        tw.update(t);
        if (t >= 1) tw.done();
        else still.push(tw);
      }
      this.tweens = still;
    }
    const pulse = 0.55 + 0.35 * Math.sin(now / 180);
    this.materials.w.check.emissiveIntensity = pulse;
    this.materials.b.check.emissiveIntensity = pulse;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
