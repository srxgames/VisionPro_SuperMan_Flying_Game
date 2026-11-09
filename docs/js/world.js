import * as THREE from 'three';

export const RING_RADIUS = 6;
export const SKY_COLOR = 0x73b3fa;
const EYE_HEIGHT = 1.6;

const RING_STYLES = {
  idle: { color: 0xffc83d, emissive: 0x3a2a00, opacity: 1 },
  locked: { color: 0x40e0ff, emissive: 0x0a5a70, opacity: 1 },
  collected: { color: 0x4cd964, emissive: 0x000000, opacity: 0.3 },
};

export function setRingState(ring, state) {
  const style = RING_STYLES[state];
  ring.material.color.setHex(style.color);
  ring.material.emissive.setHex(style.emissive);
  ring.material.opacity = style.opacity;
  ring.material.transparent = style.opacity < 1;
  ring.material.needsUpdate = true;
}

/** Procedural placeholder world, same layout rules as the native WorldBuilder. */
export function buildWorld(scene) {
  const random = mulberry32(42);
  const worldRoot = new THREE.Group();
  worldRoot.name = 'WorldRoot';
  scene.add(worldRoot);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x4a6b3a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  worldRoot.add(makeGround());
  worldRoot.add(makeCity(random));
  worldRoot.add(makeClouds(random));

  const rings = makeRingCourse(14);
  rings.forEach((ring) => worldRoot.add(ring));

  return { worldRoot, rings };
}

function makeGround() {
  // A grid texture gives the eye something to track, which sells the sense of speed.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d7347';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#3c5c38';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(400, 400);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  ground.name = 'Ground';
  return ground;
}

function makeCity(random) {
  const canyonHalfWidth = 80;
  const buildings = [];
  for (let x = -600; x <= 600; x += 50) {
    for (let z = -1300; z <= 400; z += 50) {
      if (Math.abs(x) <= canyonHalfWidth || random() >= 0.6) continue;
      buildings.push({
        x, z,
        width: range(random, 15, 35),
        depth: range(random, 15, 35),
        height: range(random, 10, 130),
      });
    }
  }

  const palette = [0x8c8c8c, 0xb3b3b3, 0x8c99b3, 0xb39e85].map((c) => new THREE.Color(c));
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    buildings.length,
  );
  mesh.name = 'City';

  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  buildings.forEach((b, i) => {
    matrix.compose(
      new THREE.Vector3(b.x, b.height / 2, b.z),
      identity,
      new THREE.Vector3(b.width, b.height, b.depth),
    );
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, palette[Math.floor(random() * palette.length)]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function makeClouds(random) {
  const cloudCount = 60;
  const puffsPerCloud = 4;
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    cloudCount * puffsPerCloud,
  );
  mesh.name = 'Clouds';

  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  let index = 0;
  for (let c = 0; c < cloudCount; c++) {
    const cx = range(random, -900, 900);
    const cy = range(random, 150, 230);
    const cz = range(random, -1500, 600);
    for (let p = 0; p < puffsPerCloud; p++) {
      const size = range(random, 10, 22);
      matrix.compose(
        new THREE.Vector3(cx + range(random, -20, 20), cy + range(random, -4, 4), cz + range(random, -10, 10)),
        identity,
        new THREE.Vector3(size, size, size),
      );
      mesh.setMatrixAt(index++, matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Rings snake down the canyon, each facing the next. */
function makeRingCourse(count) {
  const points = Array.from({ length: count }, (_, i) => new THREE.Vector3(
    Math.sin(i * 0.6) * 50,
    40 + EYE_HEIGHT + Math.sin(i * 0.9) * 20,
    -60 - i * 80,
  ));

  const geometry = new THREE.TorusGeometry(RING_RADIUS, 0.45, 12, 48);
  return points.map((point, i) => {
    const ring = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial());
    ring.name = `Ring${i}`;
    ring.position.copy(point);
    const next = points[i + 1] ?? point.clone().add(new THREE.Vector3(0, 0, -80));
    ring.lookAt(next);
    setRingState(ring, 'idle');
    return ring;
  });
}

function range(random, min, max) {
  return min + random() * (max - min);
}

/** Deterministic RNG so the city layout is identical every load. */
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
