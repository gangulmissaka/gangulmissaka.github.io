'use client';

import { useEffect, useRef, useState } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?';

export default function TextScramble({
  text,
  className = '',
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [out, setOut] = useState(text);
  const spanRef = useRef<HTMLSpanElement>(null);
  const rafRef  = useRef<number>(0);
  const fired   = useRef(false);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const scramble = () => {
      if (fired.current) return;
      fired.current = true;
      let frame = 0;
      const total = 30;
      const tick = () => {
        frame++;
        const resolved = Math.floor((frame / total) * text.length);
        setOut(
          text
            .split('')
            .map((ch, i) => {
              if (ch === ' ' || ch === '\n') return ch;
              return i < resolved
                ? ch
                : CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join('')
        );
        if (frame < total) rafRef.current = requestAnimationFrame(tick);
        else setOut(text);
      };
      setTimeout(() => { rafRef.current = requestAnimationFrame(tick); }, delay * 1000);
    };

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) scramble(); },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [text, delay]);

  return (
    <span ref={spanRef} className={className}>
      {out}
    </span>
  );
}
