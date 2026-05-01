import * as THREE from 'three';

const MAX = 500;
const tmpColor = new THREE.Color();

export function makeParticlesScene(scene) {
  const positions = new Float32Array(MAX * 3);
  const sizes = new Float32Array(MAX);
  const alphas = new Float32Array(MAX);

  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('position', posAttr);
  geom.setAttribute('aSize', sizeAttr);
  geom.setAttribute('aAlpha', alphaAttr);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor:     { value: new THREE.Color(0xffffff) },
      uPixelRatio:{ value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      uniform float uPixelRatio;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        float falloff = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, vAlpha * falloff);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  function update(state) {
    const { particleSystem, palette, beatPhase, pixelRatio } = state;
    mat.uniforms.uColor.value.set(palette.particles);
    mat.uniforms.uPixelRatio.value = pixelRatio;

    const beatSin = Math.sin(beatPhase * Math.PI * 2);
    const sizePulse = 1 + 0.35 * Math.max(0, beatSin) + 0.5 * particleSystem.bounceScale;
    const alphaPulse = 0.65 + 0.35 * Math.max(0, beatSin) + 0.3 * particleSystem.bounceScale;

    const pool = particleSystem.pool;
    let count = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      const t = p.life / p.maxLife;
      const fadeOut = 1 - t;
      const alpha = Math.min(1, fadeOut * alphaPulse);
      const size = Math.max(0.5, p.baseSize * (1 - t * 0.3) * sizePulse);
      positions[count * 3]     = p.x;
      positions[count * 3 + 1] = p.y;
      positions[count * 3 + 2] = 0;
      sizes[count] = size * 2.4; // matches the visual weight of the old shadowBlur'd dots
      alphas[count] = alpha;
      count++;
      if (count >= MAX) break;
    }

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    geom.setDrawRange(0, count);
  }

  return { update };
}
