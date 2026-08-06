'use client';

import { useRef, useCallback } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export default function TiltCard({ children, className = '', intensity = 10 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  - 0.5) * intensity;
    const y = ((e.clientY - rect.top)  / rect.height - 0.5) * intensity;
    el.style.transform = `perspective(900px) rotateX(${-y}deg) rotateY(${x}deg) translateZ(8px)`;
  }, [intensity]);

  const onLeave = useCallback(() => {
    if (ref.current) {
      ref.current.style.transform =
        'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
    }
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: 'transform 0.18s ease-out', willChange: 'transform' }}
    >
      {children}
    </div>
  );
}
