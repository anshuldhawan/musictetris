import * as THREE from 'three';
import { GRADIENT_VERT, GRADIENT_FRAG } from '../shaders/gradient.js';
import { SHIMMER_VERT, SHIMMER_FRAG } from '../shaders/shimmer.js';

const BG_Z = -140;
const SHIMMER_Z = -55;

function perspectiveFactor(z, cameraDistance) {
  return cameraDistance ? (cameraDistance - z) / cameraDistance : 1;
}

function depthProject(value, center, z, cameraDistance) {
  const f = perspectiveFactor(z, cameraDistance);
  return center + (value - center) * f;
}

export function makeBackgroundScene(scene) {
  // Fullscreen radial-gradient quad.
  const gradGeom = new THREE.PlaneGeometry(1, 1);
  const gradMat = new THREE.ShaderMaterial({
    vertexShader: GRADIENT_VERT,
    fragmentShader: GRADIENT_FRAG,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uBgA:       { value: new THREE.Color(0x0a0612) },
      uBgB:       { value: new THREE.Color(0x150b1f) },
      uGlow:      { value: new THREE.Color(0xffffff) },
      uBeatPhase: { value: 0 },
    },
  });
  const gradMesh = new THREE.Mesh(gradGeom, gradMat);
  gradMesh.renderOrder = 1;
  scene.add(gradMesh);

  function makeShimmer(mirror) {
    const geom = new THREE.PlaneGeometry(1, 1);
    if (mirror) {
      // Flip UVs horizontally so u=0 sits next to the playfield on the right side.
      const uv = geom.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, 1 - uv.getX(i));
      }
      uv.needsUpdate = true;
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHIMMER_VERT,
      fragmentShader: SHIMMER_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime:      { value: 0 },
        uBeatPhase: { value: 0 },
        uBgA:       { value: new THREE.Color(0x0a0612) },
        uBgB:       { value: new THREE.Color(0x150b1f) },
        uGlow:      { value: new THREE.Color(0xffffff) },
        uParticles: { value: new THREE.Color(0xffffff) },
        uIntensity: { value: 0.35 },
      },
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 5;
    scene.add(mesh);
    return { mesh, mat };
  }

  const left = makeShimmer(true);   // mirror so u=0 is at the playfield edge
  const right = makeShimmer(false); // u=0 already at the playfield edge for the right gutter

  function update(state) {
    const { layout, palette, beatPhase, time, viewport, cameraDistance } = state;
    const { W, H } = viewport;
    const bgScale = perspectiveFactor(BG_Z, cameraDistance);

    gradMesh.position.set(W / 2, H / 2, BG_Z);
    gradMesh.scale.set(W * bgScale, H * bgScale, 1);
    gradMat.uniforms.uBgA.value.set(palette.bgA);
    gradMat.uniforms.uBgB.value.set(palette.bgB);
    gradMat.uniforms.uGlow.value.set(palette.glow);
    gradMat.uniforms.uBeatPhase.value = beatPhase;

    const leftW = layout.x;
    const rightW = W - layout.x - layout.boardW;
    const shimmerScale = perspectiveFactor(SHIMMER_Z, cameraDistance);

    if (leftW > 0) {
      // Right edge of the left quad sits at layout.x. UVs are flipped so u=0 = right edge.
      left.mesh.position.set(
        depthProject(leftW / 2, W / 2, SHIMMER_Z, cameraDistance),
        H / 2,
        SHIMMER_Z,
      );
      left.mesh.scale.set(leftW * shimmerScale, H * shimmerScale, 1);
      left.mat.uniforms.uTime.value = time;
      left.mat.uniforms.uBeatPhase.value = beatPhase;
      left.mat.uniforms.uBgA.value.set(palette.bgA);
      left.mat.uniforms.uBgB.value.set(palette.bgB);
      left.mat.uniforms.uGlow.value.set(palette.glow);
      left.mat.uniforms.uParticles.value.set(palette.particles);
      left.mat.uniforms.uIntensity.value = 0.28 + (state.frenzyState === 'frenzy' ? 0.18 : 0);
      left.mesh.visible = true;
    } else {
      left.mesh.visible = false;
    }

    if (rightW > 0) {
      // Left edge of the right quad sits at layout.x + layout.boardW. u=0 = left edge.
      right.mesh.position.set(
        depthProject(layout.x + layout.boardW + rightW / 2, W / 2, SHIMMER_Z, cameraDistance),
        H / 2,
        SHIMMER_Z,
      );
      right.mesh.scale.set(rightW * shimmerScale, H * shimmerScale, 1);
      right.mat.uniforms.uTime.value = time;
      right.mat.uniforms.uBeatPhase.value = beatPhase;
      right.mat.uniforms.uBgA.value.set(palette.bgA);
      right.mat.uniforms.uBgB.value.set(palette.bgB);
      right.mat.uniforms.uGlow.value.set(palette.glow);
      right.mat.uniforms.uParticles.value.set(palette.particles);
      right.mat.uniforms.uIntensity.value = 0.28 + (state.frenzyState === 'frenzy' ? 0.18 : 0);
      right.mesh.visible = true;
    } else {
      right.mesh.visible = false;
    }
  }

  return { update };
}
