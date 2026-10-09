// Poses: joint limits for dragging, and the preset poses. A preset gives each bone either Euler angles in degrees
// ([x, y, z], in its parent's frame) or `aim`, the direction the limb should point in the mannequin's frame (the
// same for every body, so a pose fits man, woman and child alike).
import * as THREE from './vendor/three.module.min.js';

// Rotation limits in degrees, [min, max] per axis. Hinges (elbows, knees) bend about X only when dragged.
// Sign guide: arms and legs hang along -Y, so a negative X rotation swings them forward; +Z swings a left limb out.
export const LIMITS = {
  pelvis: { x: [-15, 15], y: [-45, 45], z: [-12, 12] },
  waist: { x: [-22, 42], y: [-40, 40], z: [-25, 25] },
  neck: { x: [-25, 30], y: [-45, 45], z: [-20, 20] },
  head: { x: [-25, 25], y: [-35, 35], z: [-20, 20] },
  upperArmL: { x: [-170, 60], y: [-90, 90], z: [-10, 175] },
  upperArmR: { x: [-170, 60], y: [-90, 90], z: [-175, 10] },
  foreArmL: { x: [-150, 2], y: [-90, 90], z: [-100, 100], hinge: true },
  foreArmR: { x: [-150, 2], y: [-90, 90], z: [-100, 100], hinge: true },
  handL: { x: [-70, 70], y: [-80, 80], z: [-35, 35] },
  handR: { x: [-70, 70], y: [-80, 80], z: [-35, 35] },
  thighL: { x: [-115, 35], y: [-40, 40], z: [-12, 50] },
  thighR: { x: [-115, 35], y: [-40, 40], z: [-50, 12] },
  shinL: { x: [-2, 145], y: [-5, 5], z: [-5, 5], hinge: true },
  shinR: { x: [-2, 145], y: [-5, 5], z: [-5, 5], hinge: true },
  footL: { x: [-35, 50], y: [-25, 25], z: [-15, 15] },
  footR: { x: [-35, 50], y: [-25, 25], z: [-15, 15] },
};

export const POSES = {
  stand: {
    label: 'Stand',
    bones: { upperArmL: [0, 0, 3], upperArmR: [0, 0, -3], foreArmL: [-8, 0, 0], foreArmR: [-8, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] },
  },
  relaxed: {
    label: 'Relaxed',
    bones: {
      pelvis: [0, 6, 4], waist: [2, -8, -5], neck: [0, 0, 3], head: [-3, 12, 2],
      thighL: [-4, 0, 3], shinL: [9, 0, 0], footL: [-4, 0, -3], thighR: [1, 0, -3], footR: [0, 0, 3],
      upperArmL: [4, 0, 7], foreArmL: [-16, 0, 0], upperArmR: [-6, 0, -9], foreArmR: [-24, 0, 0], handR: [0, 0, -8],
    },
  },
  walk: {
    label: 'Walk',
    bones: {
      pelvis: [0, 7, 1], waist: [3, -9, 0], head: [-2, 6, 0],
      thighL: [-26, 0, 1], shinL: [16, 0, 0], footL: [-8, 0, 0], thighR: [14, 0, -1], shinR: [24, 0, 0], footR: [14, 0, 0],
      upperArmL: [20, 0, 5], foreArmL: [-14, 0, 0], upperArmR: [-22, 0, -5], foreArmR: [-30, 0, 0],
    },
  },
  hip: {
    label: 'Hand on hip',
    bones: {
      pelvis: [0, -6, -4], waist: [0, 6, 4], head: [-2, -14, -3],
      thighR: [-3, 0, -3], shinR: [8, 0, 0], thighL: [1, 0, 4],
      upperArmL: { aim: [0.6, -0.68, -0.42] }, foreArmL: { aim: [-0.7, -0.5, 0.52] }, handL: { aim: [-0.25, -0.62, 0.75] },
      upperArmR: [-4, 0, -5], foreArmR: [-12, 0, 0],
    },
  },
  editorial: {
    label: 'Editorial',
    bones: {
      pelvis: [0, 10, 5], waist: [-3, -12, -6], head: [-6, -18, 5],
      thighL: [-6, 0, 6], shinL: [12, 0, 0], footL: [-6, 0, 0], thighR: [2, 0, -2],
      upperArmR: { aim: [-0.42, 0.82, -0.38] }, foreArmR: { aim: [0.86, 0.36, -0.36] }, handR: { aim: [0.45, -0.25, -0.86] },
      upperArmL: [6, 0, 9], foreArmL: [-34, 0, 0],
    },
  },
};

const D = THREE.MathUtils.degToRad;
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// The preset as one local quaternion per bone, for this mannequin. Bones the preset does not name are at rest.
export function poseQuats(m, name) {
  const pose = POSES[name] || POSES.stand, out = {}, world = {};
  for (const bone of m.order) {
    const spec = pose.bones[bone.name];
    const parent = bone.parent && bone.parent.isBone ? bone.parent.name : null;
    const parentQ = parent ? world[parent] : new THREE.Quaternion();
    let q = new THREE.Quaternion();
    if (Array.isArray(spec)) q.setFromEuler(_e.set(D(spec[0]), D(spec[1]), D(spec[2]), 'XYZ'));
    else if (spec && spec.aim) {
      const [a, b] = m.segments[bone.name], rest = new THREE.Vector3().subVectors(b, a).normalize();
      const target = new THREE.Vector3(...spec.aim).normalize().applyQuaternion(_q.copy(parentQ).invert());
      q.setFromUnitVectors(rest, target);
    }
    out[bone.name] = q;
    world[bone.name] = parentQ.clone().multiply(q);
  }
  return out;
}

// Keeps a dragged bone's rotation within its limits.
export function clampBone(name, q) {
  const lim = LIMITS[name];
  if (!lim) return q;
  _e.setFromQuaternion(q, 'XYZ');
  _e.set(
    THREE.MathUtils.clamp(_e.x, D(lim.x[0]), D(lim.x[1])),
    THREE.MathUtils.clamp(_e.y, D(lim.y[0]), D(lim.y[1])),
    THREE.MathUtils.clamp(_e.z, D(lim.z[0]), D(lim.z[1])),
    'XYZ',
  );
  return q.setFromEuler(_e);
}
