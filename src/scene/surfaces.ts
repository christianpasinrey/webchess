import * as THREE from "three";

// Procedural finishes, no textures: noise is evaluated in object space so the
// pattern stays glued to the piece while it moves.
const NOISE = /* glsl */ `
  varying vec3 vObjPos;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

// Ivory: soft growth bands running up the piece, gently warped.
const IVORY = /* glsl */ `
  float warp = fbm(vObjPos * 6.0);
  float bands = 0.5 + 0.5 * sin(vObjPos.y * 55.0 + warp * 6.0);
  diffuseColor.rgb *= mix(0.9, 1.04, bands);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.94, 0.84), fbm(vObjPos * 3.0) * 0.35);
`;

// Volcanic stone: mottled tone plus dark pores.
const STONE = /* glsl */ `
  float mottling = fbm(vObjPos * 9.0);
  float pores = smoothstep(0.72, 0.8, fbm(vObjPos * 48.0));
  diffuseColor.rgb *= mix(0.75, 1.2, mottling);
  diffuseColor.rgb *= 1.0 - pores * 0.65;
`;
// Marble: pale stone with thin dark veins.
const MARBLE = /* glsl */ `
  float vein = abs(sin(vObjPos.x * 3.0 + vObjPos.z * 2.0 + fbm(vObjPos * 2.5) * 7.0));
  diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.12, vein));
  diffuseColor.rgb *= mix(0.94, 1.04, fbm(vObjPos * 6.0));
`;

// Slate: dark, faintly layered.
const SLATE = /* glsl */ `
  diffuseColor.rgb *= mix(0.8, 1.15, fbm(vec3(vObjPos.x * 2.0, vObjPos.y * 30.0, vObjPos.z * 2.0)));
  diffuseColor.rgb *= mix(0.9, 1.05, fbm(vObjPos * 14.0));
`;

const STONE_ROUGHNESS = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor + (fbm(vObjPos * 48.0) - 0.5) * 0.5, 0.35, 1.0);
`;

type Finish = "ivory" | "stone" | "marble" | "slate";
const FINISHES: Record<Finish, string> = { ivory: IVORY, stone: STONE, marble: MARBLE, slate: SLATE };

/**
 * Patch a standard material with a procedural finish. Object space keeps the pattern glued to
 * moving pieces; world space makes tiles that share one geometry look different from each other.
 */
function withFinish<T extends THREE.MeshStandardMaterial>(
  material: T,
  finish: Finish,
  space: "object" | "world" = "object",
): T {
  const position = space === "object" ? "position" : "(modelMatrix * vec4(position, 1.0)).xyz";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvObjPos = ${position};`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FINISHES[finish]}`);
    if (finish === "stone") {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n${STONE_ROUGHNESS}`,
      );
    }
  };
  material.customProgramCacheKey = () => `${finish}-${space}`;
  return material;
}

export function elfIvory(): THREE.MeshPhysicalMaterial {
  return withFinish(
    new THREE.MeshPhysicalMaterial({
      color: "#efe4cc",
      roughness: 0.38,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
      sheen: 0.4,
    }),
    "ivory",
  );
}

export function orcStone(): THREE.MeshPhysicalMaterial {
  return withFinish(new THREE.MeshPhysicalMaterial({ color: "#3a3431", roughness: 0.85 }), "stone");
}

export function marbleTile(): THREE.MeshPhysicalMaterial {
  return withFinish(
    new THREE.MeshPhysicalMaterial({ color: "#d9d3c7", roughness: 0.3, clearcoat: 0.4 }),
    "marble",
    "world",
  );
}

export function slateTile(): THREE.MeshPhysicalMaterial {
  return withFinish(
    new THREE.MeshPhysicalMaterial({ color: "#3b3e44", roughness: 0.55, clearcoat: 0.2 }),
    "slate",
    "world",
  );
}

export function carvedStone(color = "#4a4541"): THREE.MeshStandardMaterial {
  return withFinish(new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), "stone", "world");
}
