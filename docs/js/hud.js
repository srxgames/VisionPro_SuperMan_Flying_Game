import * as THREE from 'three';

const MODE_LABELS = {
  hands: (input) => `Hands tracked: ${input.hands.length}`,
  controllers: () => 'Controllers: trigger = fly, grip = boost',
  head: () => 'No hands detected (allow hand tracking)',
  desktop: () => 'Mouse look · W fly · Shift boost · Click lock-on · R reset',
};

/** Head-locked readout drawn to a canvas, since HTML overlays don't show inside VR. */
export class Hud {
  constructor(camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 220;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.lastDraw = -Infinity;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62 * (220 / 1024)),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, fog: false }),
    );
    // Low in the field of view (~27° down), tilted back to face the eyes.
    mesh.position.set(0, -0.5, -1.0);
    mesh.rotation.x = -Math.atan2(0.5, 1.0);
    mesh.renderOrder = 999;
    camera.add(mesh);
  }

  update(flight, input, timeMs) {
    if (timeMs - this.lastDraw < 100) return;
    this.lastDraw = timeMs;

    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 20, 40, 0.6)';
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 40);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px -apple-system, system-ui, sans-serif';
    ctx.fillText(
      `${flight.speed.toFixed(0)} m/s   ${flight.altitude.toFixed(0)} m   ${flight.ringsCollected}/${flight.totalRings}`,
      40, 90,
    );

    const flags = [];
    if (flight.isBoosting) flags.push('BOOST');
    if (flight.isLockedOn) flags.push('LOCKED');
    if (flight.isComplete) flags.push('COURSE COMPLETE!');
    ctx.font = 'bold 44px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(flags.join('  '), 40, 150);

    ctx.font = '32px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(MODE_LABELS[input.mode](input), 40, 196);

    this.texture.needsUpdate = true;
  }
}
