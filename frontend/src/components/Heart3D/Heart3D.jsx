import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Keep these four knobs only.
const HEART_PANEL_SIZE = 260; // UI box in px
const HEART_SCALE = 0.7; // model size multiplier
const CAMERA_Z = 7.2; // camera distance
const CAMERA_FOV = 33; // camera field of view

const LIGHTING = {
  ambient: 1.0,
  hemi: 0.7,
  spot: 2.1,
  fill: 1.15,
};

function HeartMesh({ bpm = 72 }) {
  const rootRef = useRef();
  const meshRootRef = useRef();
  const { scene, animations } = useGLTF("/heart.glb");
  const { actions, names } = useAnimations(animations, meshRootRef);
  const fallbackPhase = useRef(0);

  useEffect(() => {
    if (!meshRootRef.current) return;
    meshRootRef.current.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mat = obj.material;
      if ("roughness" in mat) mat.roughness = Math.max(0.16, mat.roughness ?? 0.35);
      if ("metalness" in mat) mat.metalness = Math.min(0.2, mat.metalness ?? 0.08);
      if ("emissive" in mat && mat.emissive) mat.emissive.setRGB(0.24, 0.03, 0.03);
      if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.3;
      mat.needsUpdate = true;
    });
  }, []);

  useEffect(() => {
    if (!names.length) return;
    for (let i = 0; i < names.length; i += 1) {
      const act = actions[names[i]];
      if (!act) continue;
      act.reset();
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.clampWhenFinished = false;
      act.enabled = true;
      act.weight = 1;
      act.play();
    }
    return () => {
      for (let i = 0; i < names.length; i += 1) {
        const act = actions[names[i]];
        if (act) act.stop();
      }
    };
  }, [actions, names]);

  useFrame((_, delta) => {
    const safeBpm = THREE.MathUtils.clamp(Number.isFinite(bpm) ? bpm : 72, 45, 170);

    if (names.length) {
      const timeScale = safeBpm / 72;
      for (let i = 0; i < names.length; i += 1) {
        const act = actions[names[i]];
        if (act) act.timeScale = timeScale;
      }
      return;
    }

    // Fallback if GLB animation is unavailable.
    if (!rootRef.current) return;
    const freq = (safeBpm / 60) * Math.PI * 2;
    fallbackPhase.current += delta * freq;
    const raw = Math.sin(fallbackPhase.current);
    const beat = raw > 0 ? Math.pow(raw, 0.24) : 0;
    const scale = 1 + beat * 0.26;
    rootRef.current.scale.setScalar(scale);
  });

  return (
    <group ref={rootRef} scale={HEART_SCALE}>
      <primitive ref={meshRootRef} object={scene} />
    </group>
  );
}

export default function Heart3D({ bpm = 72 }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        width: HEART_PANEL_SIZE,
        height: HEART_PANEL_SIZE,
        zIndex: 50,
        background: "transparent",
        overflow: "visible",
      }}
    >
      <Canvas
        frameloop="always"
        camera={{ position: [0, 0.15, CAMERA_Z], fov: CAMERA_FOV }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={LIGHTING.ambient} />
        <hemisphereLight intensity={LIGHTING.hemi} color="#fff5f5" groundColor="#1a0d0d" />
        <spotLight position={[2.1, 3.2, 2.8]} intensity={LIGHTING.spot} angle={0.55} penumbra={0.8} color="#ffdede" />
        <pointLight position={[-1.4, 0.8, 1.9]} intensity={LIGHTING.fill} color="#ff7777" />
        <pointLight position={[0.2, 0.2, 3.2]} intensity={1.2} color="#fff2f2" />

        <HeartMesh bpm={bpm} />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          rotateSpeed={0.8}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
