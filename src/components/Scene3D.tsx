import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, MeshDistortMaterial, MeshWobbleMaterial, RoundedBox, Torus, Sphere, Box } from '@react-three/drei';
import * as THREE from 'three';

/* ─── Floating 3D shapes decorating the scene ─── */

function FloatingTorus({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    ref.current.rotation.x = state.clock.elapsedTime * 0.3;
    ref.current.rotation.y = state.clock.elapsedTime * 0.2;
  });
  return (
    <Float speed={2} rotationIntensity={2} floatIntensity={3}>
      <mesh ref={ref} position={position}>
        <torusGeometry args={[1, 0.4, 16, 32]} />
        <MeshDistortMaterial color={color} speed={2} distort={0.3} transparent opacity={0.7} />
      </mesh>
    </Float>
  );
}

function FloatingBox({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    ref.current.rotation.x = state.clock.elapsedTime * 0.4;
    ref.current.rotation.z = state.clock.elapsedTime * 0.2;
  });
  return (
    <Float speed={1.5} rotationIntensity={1.5} floatIntensity={2}>
      <RoundedBox ref={ref} args={[1.2, 1.2, 1.2]} radius={0.15} position={position}>
        <MeshWobbleMaterial color={color} speed={1} factor={0.3} transparent opacity={0.6} />
      </RoundedBox>
    </Float>
  );
}

function FloatingSphere({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <MeshDistortMaterial color={color} speed={3} distort={0.4} transparent opacity={0.5} />
    </mesh>
  );
}

function FloatingCone({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.5;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.3;
  });
  return (
    <Float speed={2.5} rotationIntensity={2} floatIntensity={2.5}>
      <mesh ref={ref} position={position}>
        <coneGeometry args={[0.7, 1.5, 4]} />
        <meshStandardMaterial color={color} transparent opacity={0.6} wireframe />
      </mesh>
    </Float>
  );
}

function FloatingOctahedron({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    ref.current.rotation.x = state.clock.elapsedTime * 0.2;
    ref.current.rotation.y = state.clock.elapsedTime * 0.3;
  });
  return (
    <Float speed={1.8} rotationIntensity={3} floatIntensity={2}>
      <mesh ref={ref} position={position}>
        <octahedronGeometry args={[0.9]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} wireframe />
      </mesh>
    </Float>
  );
}

/* ─── The entire 3D world ─── */

export default function Scene3D() {
  return (
    <group>
      {/* Ambient + directional lights */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} color="#a78bfa" />
      <directionalLight position={[-5, 3, -5]} intensity={0.3} color="#ec4899" />
      <pointLight position={[0, 10, 0]} intensity={0.5} color="#6366f1" />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#a855f7" />

      {/* Decorative shapes scattered in the scene */}
      <FloatingTorus position={[-6, 2, -5]} color="#6366f1" />
      <FloatingTorus position={[8, -3, -8]} color="#a855f7" />
      <FloatingBox position={[5, 4, -6]} color="#ec4899" />
      <FloatingBox position={[-7, -4, -10]} color="#8b5cf6" />
      <FloatingSphere position={[9, 1, -4]} color="#6366f1" />
      <FloatingSphere position={[-4, 5, -12]} color="#d946ef" />
      <FloatingCone position={[3, -5, -7]} color="#a855f7" />
      <FloatingCone position={[-9, 3, -9]} color="#ec4899" />
      <FloatingOctahedron position={[7, 6, -14]} color="#818cf8" />
      <FloatingOctahedron position={[-5, -2, -6]} color="#c084fc" />
      <FloatingTorus position={[0, -6, -11]} color="#f472b6" />
      <FloatingBox position={[12, 0, -15]} color="#6366f1" />
      <FloatingSphere position={[-10, 6, -8]} color="#a78bfa" />
    </group>
  );
}
