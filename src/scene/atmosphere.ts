import * as THREE from "three";
import { carvedStone, elfIvory, orcStone } from "./surfaces";

// Board edge corners: elves (white) sit at +Z, orcs (black) at -Z.
const LANTERN_SPOTS = [new THREE.Vector3(-5.7, -0.42, 5.7), new THREE.Vector3(5.7, -0.42, 5.7)];
const BRAZIER_SPOTS = [new THREE.Vector3(-5.7, -0.42, -5.7), new THREE.Vector3(5.7, -0.42, -5.7)];
// Crystal position inside the lantern model (Blender (0.21, -0.16, 1.26) in glTF axes).
const CRYSTAL_OFFSET = new THREE.Vector3(0.21, 1.26, 0.16);
const EMBERS_PER_BRAZIER = 70;
const MOTES = 110;

function glowSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function emissive(color: string, intensity: number) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });
}

/** Everything around the board: dais, carved frame, lanterns, braziers, embers, fireflies, stars. */
export class Atmosphere {
  private runes: THREE.MeshStandardMaterial[] = [];
  private crystals: { light: THREE.PointLight; material: THREE.MeshStandardMaterial }[] = [];
  private fires: { light: THREE.PointLight; material: THREE.MeshStandardMaterial; seed: number }[] = [];
  private embers: THREE.Points;
  private emberState: { origin: THREE.Vector3; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];
  private motes: THREE.Points;
  private moteSeeds: { base: THREE.Vector3; phase: number; speed: number }[] = [];

  constructor(scene: THREE.Scene, geometries: Map<string, THREE.BufferGeometry>) {
    const geometry = (name: string) => {
      const g = geometries.get(name);
      if (!g) throw new Error(`Missing geometry ${name}`);
      return g;
    };

    scene.background = new THREE.Color("#05060b");
    scene.fog = new THREE.Fog("#05060b", 16, 34);
    scene.add(this.stars());

    const dais = new THREE.Mesh(geometry("dais"), carvedStone("#2c2a28"));
    dais.receiveShadow = true;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ color: "#0b0c10", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    ground.receiveShadow = true;
    const frame = new THREE.Mesh(geometry("frame"), carvedStone("#3d3935"));
    frame.castShadow = frame.receiveShadow = true;
    scene.add(dais, ground, frame);

    for (const [name, color] of [
      ["runes_elf", "#8fd3ff"],
      ["runes_orc", "#ff5a1f"],
    ] as const) {
      const material = emissive(color, 1.5);
      this.runes.push(material);
      scene.add(new THREE.Mesh(geometry(name), material));
    }

    const center = new THREE.Vector3();
    const facing = (spot: THREE.Vector3, local: THREE.Vector3) => {
      const to = center.clone().sub(spot);
      return Math.atan2(to.x, to.z) - Math.atan2(local.x, local.z);
    };

    for (const spot of LANTERN_SPOTS) {
      const lantern = new THREE.Mesh(geometry("lantern"), elfIvory());
      lantern.castShadow = true;
      const material = emissive("#bfe6ff", 2.5);
      lantern.add(new THREE.Mesh(geometry("lantern_glow"), material));
      lantern.position.copy(spot);
      lantern.rotation.y = facing(spot, CRYSTAL_OFFSET);
      lantern.updateMatrixWorld();
      const light = new THREE.PointLight("#9fd4ff", 9, 10, 1.6);
      light.position.copy(lantern.localToWorld(CRYSTAL_OFFSET.clone()));
      this.crystals.push({ light, material });
      scene.add(lantern, light);
    }

    for (const [i, spot] of BRAZIER_SPOTS.entries()) {
      const brazier = new THREE.Mesh(geometry("brazier"), orcStone());
      brazier.castShadow = true;
      const material = emissive("#ff6a1c", 3);
      brazier.add(new THREE.Mesh(geometry("brazier_glow"), material));
      brazier.position.copy(spot);
      const light = new THREE.PointLight("#ff7a2a", 12, 11, 1.5);
      light.position.copy(spot).add(new THREE.Vector3(0, 1.1, 0));
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      this.fires.push({ light, material, seed: i * 17.3 });
      scene.add(brazier, light);
    }

    const sprite = glowSprite();
    this.embers = this.particles(BRAZIER_SPOTS.length * EMBERS_PER_BRAZIER, "#ff8a3c", 0.09, sprite);
    for (let i = 0; i < BRAZIER_SPOTS.length * EMBERS_PER_BRAZIER; i++) {
      const state = {
        origin: BRAZIER_SPOTS[i % BRAZIER_SPOTS.length],
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
      };
      this.respawnEmber(state, Math.random());
      this.emberState.push(state);
    }
    this.motes = this.particles(MOTES, "#cdeeff", 0.07, sprite);
    for (let i = 0; i < MOTES; i++) {
      const near = LANTERN_SPOTS[i % LANTERN_SPOTS.length];
      const base =
        i % 3 === 0
          ? near
              .clone()
              .add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 2.5))
          : new THREE.Vector3((Math.random() - 0.5) * 12, 0.3 + Math.random() * 2.2, 1.5 + Math.random() * 5.5);
      this.moteSeeds.push({ base, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.5 });
    }
    scene.add(this.embers, this.motes);
  }

  private stars(): THREE.Points {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Upper hemisphere only, a bit above the horizon.
      const theta = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      positions.set([Math.cos(theta) * r * 60, y * 60, Math.sin(theta) * r * 60], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: "#c8d4ff", size: 0.18, fog: false, transparent: true, opacity: 0.8 }),
    );
  }

  private particles(count: number, color: string, size: number, map: THREE.Texture): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  private respawnEmber(state: (typeof this.emberState)[number], progress = 0) {
    state.maxLife = 1.5 + Math.random() * 2.5;
    state.life = state.maxLife * progress;
    state.velocity.set((Math.random() - 0.5) * 0.25, 0.5 + Math.random() * 0.7, (Math.random() - 0.5) * 0.25);
  }

  update(time: number, dt: number) {
    this.runes.forEach((material, i) => {
      material.emissiveIntensity = 1.3 + Math.sin(time * 0.9 + i * 2) * 0.5;
    });

    for (const [i, { light, material }] of this.crystals.entries()) {
      const pulse = Math.sin(time * 1.3 + i * 1.7);
      light.intensity = 8 + pulse * 1.5;
      material.emissiveIntensity = 2.4 + pulse * 0.6;
    }

    for (const { light, material, seed } of this.fires) {
      const flicker =
        Math.sin(time * 11 + seed) * 0.5 + Math.sin(time * 23.7 + seed * 2) * 0.3 + Math.sin(time * 5.1 + seed) * 0.4;
      light.intensity = 12 + flicker * 3;
      material.emissiveIntensity = 3 + flicker;
    }

    const emberPositions = this.embers.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.emberState.forEach((state, i) => {
      state.life += dt;
      if (state.life > state.maxLife) this.respawnEmber(state);
      const t = state.life;
      const swirl = Math.sin(t * 3 + i) * 0.15;
      emberPositions.setXYZ(
        i,
        state.origin.x + state.velocity.x * t + swirl,
        state.origin.y + 0.85 + state.velocity.y * t,
        state.origin.z + state.velocity.z * t + Math.cos(t * 2.5 + i) * 0.12,
      );
    });
    emberPositions.needsUpdate = true;

    const motePositions = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.moteSeeds.forEach(({ base, phase, speed }, i) => {
      const t = time * speed + phase;
      motePositions.setXYZ(
        i,
        base.x + Math.sin(t) * 0.6,
        base.y + Math.sin(t * 1.7) * 0.25,
        base.z + Math.cos(t * 0.8) * 0.6,
      );
    });
    motePositions.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.75 + Math.sin(time * 3) * 0.2;
  }
}
