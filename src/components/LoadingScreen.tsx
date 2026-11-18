import React, { useState, useEffect } from 'react';

interface LoadingScreenProps {
  onComplete: () => void;
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setHidden(true);
            setTimeout(onComplete, 800);
          }, 400);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className={`loader-container ${hidden ? 'hidden' : ''}`}>
      <p style={{
        fontSize: '14px',
        letterSpacing: '8px',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
        fontWeight: 300,
      }}>
        Loading Experience
      </p>
      <div className="loader-bar-bg">
        <div className="loader-bar" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <p style={{
        marginTop: '12px',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'monospace',
      }}>
        {Math.min(Math.round(progress), 100)}%
      </p>
    </div>
  );
}
