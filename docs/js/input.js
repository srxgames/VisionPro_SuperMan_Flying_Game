import * as THREE from 'three';

const FIST_THRESHOLD = 0.10; // average wrist-to-fingertip distance (m); an open hand is ~0.17 m
const FINGER_TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

/** Reads head pose, hand joints (Vision Pro / Quest hands) and controller triggers (Quest). */
export class XRInput {
  read(frame, refSpace, session) {
    const viewer = frame.getViewerPose(refSpace);
    const head = viewer ? headFromTransform(viewer.transform) : null;

    const hands = [];
    let controllers = 0;
    let throttle = 0;
    let boost = false;

    for (const source of session.inputSources) {
      if (source.hand) {
        const hand = readHand(frame, source.hand, refSpace);
        if (hand) hands.push(hand);
      } else if (source.gamepad && source.targetRayMode === 'tracked-pointer') {
        controllers++;
        const buttons = source.gamepad.buttons;
        throttle = Math.max(throttle, buttons[0]?.value ?? 0);
        boost = boost || (buttons[1]?.pressed ?? false);
      }
    }

    const mode = hands.length ? 'hands' : controllers ? 'controllers' : 'head';
    return { mode, head, hands, throttle, boost };
  }
}

function headFromTransform(transform) {
  const { position: p, orientation: o } = transform;
  const quaternion = new THREE.Quaternion(o.x, o.y, o.z, o.w);
  return {
    position: new THREE.Vector3(p.x, p.y, p.z),
    forward: new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion),
    quaternion,
  };
}

function readHand(frame, hand, refSpace) {
  const wrist = jointPosition(frame, hand, 'wrist', refSpace);
  const knuckle = jointPosition(frame, hand, 'middle-finger-phalanx-proximal', refSpace);
  if (!wrist || !knuckle) return null;

  const tips = FINGER_TIPS.map((name) => jointPosition(frame, hand, name, refSpace)).filter(Boolean);
  const averageCurl = tips.length
    ? tips.reduce((sum, tip) => sum + tip.distanceTo(wrist), 0) / tips.length
    : Infinity;

  return {
    palm: wrist.clone().add(knuckle).multiplyScalar(0.5),
    isFist: averageCurl < FIST_THRESHOLD,
  };
}

function jointPosition(frame, hand, name, refSpace) {
  const space = hand.get(name);
  const pose = space && frame.getJointPose(space, refSpace);
  if (!pose) return null;
  const p = pose.transform.position;
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** Mouse look + keyboard so the game is testable on a regular PC. */
export class DesktopInput {
  constructor(dom, camera, { onSelect, onReset }) {
    this.dom = dom;
    this.camera = camera;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;

    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'KeyR' && this.enabled) onReset();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('click', () => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== dom) {
        dom.requestPointerLock();
        return;
      }
      const origin = camera.getWorldPosition(new THREE.Vector3());
      const direction = camera.getWorldDirection(new THREE.Vector3());
      onSelect(origin, direction);
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= event.movementX * 0.002;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.002, -1.45, 1.45);
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      if (document.pointerLockElement === this.dom) document.exitPointerLock();
    }
  }

  read() {
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();

    const flying = this.enabled && (this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    const boosting = flying && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    return {
      mode: 'desktop',
      head: {
        position: this.camera.position.clone(),
        forward: new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion),
        quaternion: this.camera.quaternion.clone(),
      },
      hands: [],
      throttle: flying ? 1 : 0,
      boost: boosting,
    };
  }
}
