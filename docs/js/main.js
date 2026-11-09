import * as THREE from 'three';
import { buildWorld, SKY_COLOR } from './world.js';
import { FlightController } from './flight.js';
import { XRInput, DesktopInput } from './input.js';
import { Hud } from './hud.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 250, 1400);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 1.6, 0);
scene.add(camera);

const { worldRoot, rings } = buildWorld(scene);
const flight = new FlightController(worldRoot, rings);
const hud = new Hud(camera);
const xrInput = new XRInput();
const desktop = new DesktopInput(renderer.domElement, camera, {
  onSelect: (origin, direction) => flight.lockOnAlong(origin, direction),
  onReset: () => flight.reset(),
});

// ---------- Overlay / session UI ----------

const overlay = document.getElementById('overlay');
const enterVRButton = document.getElementById('enter-vr');
const desktopButton = document.getElementById('play-desktop');
const status = document.getElementById('status');

async function checkXRSupport() {
  if (!navigator.xr) {
    status.textContent = 'WebXR not available here. Use "Play in Browser", or open this page in Safari on Vision Pro.';
    return;
  }
  const supported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  enterVRButton.disabled = !supported;
  status.textContent = supported
    ? 'VR ready. Allow hand tracking when asked.'
    : 'Immersive VR not supported on this device. Use "Play in Browser".';
}
checkXRSupport();

enterVRButton.addEventListener('click', async () => {
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'hand-tracking'],
    });

    // On Vision Pro a pinch arrives as a "transient-pointer" whose ray is where the user was looking.
    session.addEventListener('selectstart', (event) => {
      const pose = event.frame.getPose(event.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());
      if (!pose) return;
      const { position, orientation } = pose.transform;
      const origin = new THREE.Vector3(position.x, position.y, position.z);
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
      );
      flight.lockOnAlong(origin, direction);
    });

    session.addEventListener('end', () => {
      overlay.classList.remove('hidden');
    });

    desktop.setEnabled(false);
    await renderer.xr.setSession(session);
    overlay.classList.add('hidden');
  } catch (error) {
    status.textContent = `Could not start VR: ${error.message}`;
  }
});

desktopButton.addEventListener('click', () => {
  overlay.classList.add('hidden');
  desktop.setEnabled(true);
  renderer.domElement.requestPointerLock();
});

// Browsers swallow Escape while the pointer is locked, so treat losing the lock as "pause".
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && desktop.enabled && !renderer.xr.isPresenting) {
    desktop.setEnabled(false);
    overlay.classList.remove('hidden');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Main loop ----------

const clock = new THREE.Clock();

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(clock.getDelta(), 0.1);

  const input = frame && renderer.xr.isPresenting
    ? xrInput.read(frame, renderer.xr.getReferenceSpace(), renderer.xr.getSession())
    : desktop.read();

  flight.update(input, dt);
  hud.update(flight, input, time);
  renderer.render(scene, camera);
});
