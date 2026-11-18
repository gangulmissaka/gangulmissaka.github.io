import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import ParticleField from './ParticleField';
import Scene3D from './Scene3D';
import CameraRig from './CameraRig';

export default function Experience() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 60 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(ellipse at center, #0f0f1a 0%, #0a0a0a 70%)',
      }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <fog attach="fog" args={['#0a0a0a', 15, 40]} />
        <ParticleField />
        <Scene3D />
        <CameraRig />
      </Suspense>
    </Canvas>
  );
}
