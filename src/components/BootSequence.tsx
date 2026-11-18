import React, { useState, useEffect, useCallback } from 'react';

interface Props { onComplete: () => void; }

const LINES = [
  { text: 'PortfolioOS BIOS v4.2.0', delay: 80 },
  { text: 'Copyright (C) 2024 Creative Systems Inc.', delay: 60 },
  { text: '', delay: 200 },
  { text: 'CPU: Creative Engineer @ ∞ GHz .............. OK', delay: 120 },
  { text: 'RAM: 32 GB Imagination DDR5 ................. OK', delay: 100 },
  { text: 'GPU: RTX Creativity 5090 .................... OK', delay: 100 },
  { text: 'SSD: ∞ TB Ideas NVMe ....................... OK', delay: 100 },
  { text: 'NET: Fiber Optic Dream Connection ........... OK', delay: 100 },
  { text: '', delay: 150 },
  { text: 'Loading kernel modules...', delay: 200 },
  { text: '  [✓] three.js-renderer', delay: 80 },
  { text: '  [✓] react-dom-engine', delay: 80 },
  { text: '  [✓] creativity-driver', delay: 80 },
  { text: '  [✓] design-subsystem', delay: 80 },
  { text: '  [✓] portfolio-services', delay: 80 },
  { text: '', delay: 100 },
  { text: 'Mounting filesystem.......................... OK', delay: 150 },
  { text: 'Starting window manager...................... OK', delay: 150 },
  { text: 'Initializing desktop environment............. OK', delay: 200 },
  { text: '', delay: 100 },
  { text: 'System ready. Welcome, visitor.', delay: 300 },
];

export default function BootSequence({ onComplete }: Props) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    let timeout: NodeJS.Timeout;

    const showNext = () => {
      if (i >= LINES.length) {
        setTimeout(() => { setDone(true); setTimeout(onComplete, 900); }, 600);
        return;
      }
      setVisibleLines(prev => [...prev, LINES[i].text]);
      setProgress(((i + 1) / LINES.length) * 100);
      const delay = LINES[i].delay;
      i++;
      timeout = setTimeout(showNext, delay);
    };

    timeout = setTimeout(showNext, 500);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className={`boot-screen ${done ? 'done' : ''}`}>
      <div className="boot-text">
        {visibleLines.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
        {!done && <span className="boot-cursor" />}
      </div>
      <div className="boot-bar-bg">
        <div className="boot-bar" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(0,255,65,.4)', fontFamily: 'JetBrains Mono, monospace' }}>
        {Math.min(Math.round(progress), 100)}%
      </div>
    </div>
  );
}
