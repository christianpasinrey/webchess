import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { elfIvory, marbleTile, orcStone, slateTile } from "./surfaces";
import { Atmosphere } from "./atmosphere";

const FILES = "abcdefgh";
const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
// White plays the elves, black the orcs (see blender/build_pieces.py).
const SIDES: Record<Color, string> = { w: "elf", b: "orc" };
const GLOW_COLORS: Record<Color, string> = { w: "#bfe3ff", b: "#ff4a1c" };
const ACCENT = new THREE.Color("#d97757");

export interface Highlights {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: string; to: string } | null;
  check: Square | null;
  thinking: boolean;
}

interface Tween {
  update: (t: number) => void;
  duration: number;
  elapsed: number;
  done?: () => void;
}

function squareToPos(square: string): THREE.Vector3 {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return new THREE.Vector3(file - 3.5, 0, 4.5 - rank);
}

/**
 * Return the mesh geometry in float attributes with its node transform applied.
 * Meshopt quantization stores positions as normalized integers and moves the
 * dequantization scale/offset into the node, so the transform must be baked.
 */
function bakeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal"] as const) {
    const attr = source.getAttribute(name);
    if (!attr) continue;
    const data = new Float32Array(attr.count * 3);
    for (let i = 0; i < attr.count; i++) data.set([attr.getX(i), attr.getY(i), attr.getZ(i)], i * 3);
    geometry.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  if (source.index) geometry.setIndex(source.index);
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingSphere();
  return geometry;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Board3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();

  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials: Record<Color, () => THREE.MeshPhysicalMaterial> = { w: elfIvory, b: orcStone };
  private glowMaterials: Record<Color, THREE.MeshStandardMaterial>;
  private tiles = new Map<Square, THREE.Mesh>();
  private tileBase = new Map<Square, THREE.Color>();
  private pieces = new Map<Square, THREE.Mesh>();
  private tweens: Tween[] = [];

  private keyLight: THREE.DirectionalLight;
  private rimLights: THREE.PointLight[] = [];
  private focusLight: THREE.SpotLight;
  private selectLight: THREE.PointLight;
  private checkLight: THREE.PointLight;
  private highlights: Highlights = { selected: null, targets: [], lastMove: null, check: null, thinking: false };
  private cameraTarget: THREE.Vector3 | null = null;
  private atmosphere: Atmosphere | null = null;

  private container: HTMLElement;
  private onSquareClick: (square: Square) => void;

  constructor(container: HTMLElement, onSquareClick: (square: Square) => void) {
    this.container = container;
    this.onSquareClick = onSquareClick;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.append(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.scene.background = new THREE.Color("#0e0f13");
    this.scene.fog = new THREE.Fog("#0e0f13", 14, 30);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
    this.camera.position.set(0, 9, 9.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.3);
    this.controls.enableDamping = true;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.enablePan = false;

    this.glowMaterials = {
      w: new THREE.MeshStandardMaterial({ color: GLOW_COLORS.w, emissive: GLOW_COLORS.w, emissiveIntensity: 1.4 }),
      b: new THREE.MeshStandardMaterial({ color: GLOW_COLORS.b, emissive: GLOW_COLORS.b, emissiveIntensity: 1.8 }),
    };

    // Cool moonlight from the elves' side.
    this.keyLight = new THREE.DirectionalLight("#dfe6ff", 1.8);
    this.focusLight = new THREE.SpotLight("#ffd27a", 0, 9, Math.PI / 9, 0.55, 1.2);
    this.selectLight = new THREE.PointLight("#5aa9ff", 0, 2.6, 1.6);
    this.checkLight = new THREE.PointLight("#ff3030", 0, 3, 1.4);
    this.buildLights();
    this.buildBoard();

    window.addEventListener("resize", () => this.resize());
    this.renderer.domElement.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
    this.renderer.domElement.addEventListener("pointerup", (e) => this.handlePointerUp(e));
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  async load(url: string): Promise<void> {
    // The model is meshopt-compressed (see `npm run model`).
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    // Only geometry is used; placement and materials are decided here.
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) this.geometries.set(obj.name, bakeGeometry(obj));
    });
    this.atmosphere = new Atmosphere(this.scene, this.geometries);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#8fa6ff", "#2a1a10", 0.25));

    this.keyLight.position.set(4, 10, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -8;
    this.keyLight.shadow.camera.right = 8;
    this.keyLight.shadow.camera.top = 8;
    this.keyLight.shadow.camera.bottom = -8;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight);

    for (const color of ["#ff8a5c", "#5c9dff"]) {
      const light = new THREE.PointLight(color, 10, 16, 1.6);
      this.rimLights.push(light);
      this.scene.add(light);
    }

    this.focusLight.position.set(0, 6, 0);
    this.focusLight.castShadow = true;
    this.focusLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.focusLight, this.focusLight.target);
    this.scene.add(this.selectLight, this.checkLight);
  }

  private buildBoard() {
    const tileGeo = new THREE.BoxGeometry(0.985, 0.12, 0.985);
    for (let f = 0; f < 8; f++) {
      for (let r = 1; r <= 8; r++) {
        const square = `${FILES[f]}${r}` as Square;
        const dark = (f + r) % 2 === 0;
        const material = dark ? slateTile() : marbleTile();
        const base = material.color.clone();
        const tile = new THREE.Mesh(tileGeo, material);
        tile.position.copy(squareToPos(square)).setY(-0.06);
        tile.receiveShadow = true;
        tile.userData.square = square;
        this.tiles.set(square, tile);
        this.tileBase.set(square, base);
        this.scene.add(tile);
      }
    }
  }

  private makePiece(color: Color, type: PieceSymbol, square: Square): THREE.Mesh {
    const name = `${SIDES[color]}_${PIECE_NAMES[type]}`;
    const geometry = this.geometries.get(name);
    if (!geometry) throw new Error(`Missing geometry for ${name}`);
    const mesh = new THREE.Mesh(geometry, this.materials[color]());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const glowGeometry = this.geometries.get(`${name}_glow`);
    if (glowGeometry) {
      const glow = new THREE.Mesh(glowGeometry, this.glowMaterials[color].clone());
      glow.name = "glow";
      mesh.add(glow);
    }
    mesh.position.copy(squareToPos(square));
    // Figures are modelled facing +Z (towards white); each army faces the enemy.
    mesh.rotation.y = color === "w" ? Math.PI : 0;
    mesh.userData = { square, color, type };
    this.scene.add(mesh);
    return mesh;
  }

  /** Place all pieces instantly (new game, undo). */
  setPosition(game: Chess) {
    for (const mesh of this.pieces.values()) this.scene.remove(mesh);
    this.pieces.clear();
    this.tweens = [];
    for (const row of game.board()) {
      for (const sq of row) {
        if (sq) this.pieces.set(sq.square, this.makePiece(sq.color, sq.type, sq.square));
      }
    }
  }

  /** Animate a move that was just played on the game. */
  animateMove(move: Move) {
    const mesh = this.pieces.get(move.from);
    if (!mesh) return;

    const captureSquare = move.isEnPassant() ? (`${move.to[0]}${move.from[1]}` as Square) : move.to;
    const captured = move.captured ? this.pieces.get(captureSquare) : undefined;
    if (captured) {
      this.pieces.delete(captureSquare);
      this.removePiece(captured, 0.25);
    }

    this.pieces.delete(move.from);
    this.pieces.set(move.to, mesh);
    mesh.userData.square = move.to;
    const hop = move.piece === "n" ? 0.9 : captured ? 0.35 : 0.15;
    this.slide(mesh, move.to, hop, () => {
      if (move.promotion) {
        this.removePiece(mesh, 0);
        const promoted = this.makePiece(move.color, move.promotion, move.to);
        this.pieces.set(move.to, promoted);
        promoted.scale.setScalar(0.01);
        this.tween(0.45, (t) => promoted.scale.setScalar(Math.max(0.01, ease(t))));
      }
    });

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rank = move.from[1];
      const [rookFrom, rookTo] = move.isKingsideCastle() ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
      const rook = this.pieces.get(rookFrom as Square);
      if (rook) {
        this.pieces.delete(rookFrom as Square);
        this.pieces.set(rookTo as Square, rook);
        rook.userData.square = rookTo;
        this.slide(rook, rookTo as Square, 0.6);
      }
    }
  }

  private slide(mesh: THREE.Mesh, to: Square, hop: number, done?: () => void) {
    const start = mesh.position.clone();
    const end = squareToPos(to);
    const distance = start.distanceTo(end);
    this.tween(
      0.35 + distance * 0.06,
      (t) => {
        const k = ease(t);
        mesh.position.lerpVectors(start, end, k);
        mesh.position.y = Math.sin(Math.PI * k) * hop;
      },
      done,
    );
  }

  private removePiece(mesh: THREE.Mesh, delay: number) {
    const material = mesh.material as THREE.MeshPhysicalMaterial;
    material.transparent = true;
    const glow = mesh.getObjectByName("glow");
    if (glow) glow.visible = false;
    const startY = mesh.position.y;
    this.tween(
      0.5 + delay,
      (t) => {
        const k = Math.max(0, (t * (0.5 + delay) - delay) / 0.5);
        mesh.position.y = startY - k * 0.8;
        material.opacity = 1 - k;
        material.emissive.copy(ACCENT).multiplyScalar(k * 0.8);
      },
      () => {
        this.scene.remove(mesh);
        material.dispose();
      },
    );
  }

  private tween(duration: number, update: (t: number) => void, done?: () => void) {
    this.tweens.push({ duration, elapsed: 0, update, done });
  }

  setHighlights(h: Highlights) {
    this.highlights = h;
    for (const [square, tile] of this.tiles) {
      const material = tile.material as THREE.MeshPhysicalMaterial;
      material.color.copy(this.tileBase.get(square)!);
      material.emissive.set("#000000");
      if (h.lastMove && (square === h.lastMove.from || square === h.lastMove.to)) {
        material.color.lerp(new THREE.Color("#f2c84b"), 0.35);
      }
    }
    for (const square of h.targets) {
      const material = this.tiles.get(square)!.material as THREE.MeshPhysicalMaterial;
      material.emissive.set(this.pieces.has(square) ? "#ff5a3c" : "#3c8cff");
    }

    if (h.selected) {
      const pos = squareToPos(h.selected);
      this.selectLight.position.set(pos.x, 0.5, pos.z);
      this.selectLight.intensity = 6;
    } else {
      this.selectLight.intensity = 0;
    }

    if (h.check) {
      const pos = squareToPos(h.check);
      this.checkLight.position.set(pos.x, 0.4, pos.z);
    }
    this.checkLight.intensity = h.check ? 8 : 0;
  }

  /** Rotate the camera to the player's side. */
  setOrientation(color: Color) {
    const z = color === "w" ? 9.5 : -9.5;
    this.cameraTarget = new THREE.Vector3(0, 9, z);
  }

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    this.atmosphere?.update(time, dt);

    // Run completion callbacks after swapping the list: they may start new tweens
    // (promotion, capture fade) that would otherwise be dropped by the filter.
    const finished: Tween[] = [];
    this.tweens = this.tweens.filter((tw) => {
      tw.elapsed += dt;
      const t = Math.min(tw.elapsed / tw.duration, 1);
      tw.update(t);
      if (t >= 1) finished.push(tw);
      return t < 1;
    });
    for (const tw of finished) tw.done?.();

    // Slowly orbiting rim lights; they speed up and turn warm while Claude thinks.
    const speed = this.highlights.thinking ? 1.6 : 0.25;
    this.rimLights.forEach((light, i) => {
      const angle = time * speed + i * Math.PI;
      light.position.set(Math.cos(angle) * 7, 3 + Math.sin(time * 0.7 + i) * 0.6, Math.sin(angle) * 7);
      const pulse = this.highlights.thinking ? 22 + Math.sin(time * 6 + i) * 10 : 16;
      light.intensity += (pulse - light.intensity) * 0.08;
    });

    // Spotlight follows the last moved piece.
    const last = this.highlights.lastMove && this.pieces.get(this.highlights.lastMove.to as Square);
    const focusIntensity = last ? 40 : 0;
    this.focusLight.intensity += (focusIntensity - this.focusLight.intensity) * 0.06;
    if (last) {
      this.focusLight.target.position.lerp(last.position, 0.12);
      this.focusLight.position.set(this.focusLight.target.position.x * 0.6, 6, this.focusLight.target.position.z * 0.6);
    }

    // Legal-move tiles breathe.
    const glow = 0.35 + Math.sin(time * 4) * 0.15;
    for (const square of this.highlights.targets) {
      const material = this.tiles.get(square)!.material as THREE.MeshPhysicalMaterial;
      material.emissiveIntensity = glow;
    }
    if (this.highlights.check) this.checkLight.intensity = 6 + Math.sin(time * 8) * 3;

    // Glow cores breathe; the selected piece burns brighter.
    for (const [square, mesh] of this.pieces) {
      const glow = mesh.getObjectByName("glow") as THREE.Mesh | undefined;
      if (!glow) continue;
      const material = glow.material as THREE.MeshStandardMaterial;
      const base = square === this.highlights.selected ? 3.5 : 1.3;
      material.emissiveIntensity = base + Math.sin(time * 2.2 + mesh.position.x * 1.7 + mesh.position.z) * 0.35;
    }

    // Selected piece levitates a little.
    for (const [square, mesh] of this.pieces) {
      if (this.tweens.length) break;
      const lift = square === this.highlights.selected ? 0.18 + Math.sin(time * 3) * 0.04 : 0;
      mesh.position.y += (lift - mesh.position.y) * 0.2;
    }

    if (this.cameraTarget) {
      // Swing around the board instead of cutting through it.
      const current = new THREE.Spherical().setFromVector3(this.camera.position);
      const goal = new THREE.Spherical().setFromVector3(this.cameraTarget);
      let delta = goal.theta - current.theta;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      current.theta += delta * 0.06;
      current.phi += (goal.phi - current.phi) * 0.06;
      current.radius += (goal.radius - current.radius) * 0.06;
      this.camera.position.setFromSpherical(current);
      if (Math.abs(delta) < 0.002) this.cameraTarget = null;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Treat as a click only if the pointer barely moved (otherwise it was an orbit drag).
  private downAt = { x: 0, y: 0 };
  private handlePointerDown(e: PointerEvent) {
    this.downAt = { x: e.clientX, y: e.clientY };
  }

  private handlePointerUp(e: PointerEvent) {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [...this.pieces.values(), ...this.tiles.values()];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    const owner = hit?.object.name === "glow" ? hit.object.parent : hit?.object;
    const square = owner?.userData.square as Square | undefined;
    if (square) this.onSquareClick(square);
  }
}
