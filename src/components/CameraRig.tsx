import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function CameraRig() {
  const { camera, mouse } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 5));

  useFrame((state) => {
    // Smooth parallax camera movement following the mouse
    const x = mouse.x * 1.5;
    const y = mouse.y * 1.0;

    camera.position.x += (x - camera.position.x) * 0.05;
    camera.position.y += (y - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  return null;
}
