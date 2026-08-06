'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
  { id: 'identity',    label: 'PROFILE'  },
  { id: 'methodology', label: 'APPROACH' },
  { id: 'skills',      label: 'SKILLS'   },
  { id: 'contact',     label: 'CONNECT'  },
];

export default function FloatingNav() {
  const [active, setActive]   = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const identity = document.getElementById('identity');
      if (identity) {
        setVisible(identity.getBoundingClientRect().top < window.innerHeight * 0.8);
      }
      let cur = '';
      for (const { id } of NAV_ITEMS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) cur = id;
      }
      setActive(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{ y: -40,    opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[9990] flex items-center gap-1 px-3 py-2 rounded-full"
          style={{
            background:    'rgba(0, 0, 0, 0.88)',
            backdropFilter:'blur(24px)',
            border:        '1px solid rgba(0, 242, 255, 0.15)',
            boxShadow:     '0 0 30px rgba(0,242,255,0.05), 0 4px 24px rgba(0,0,0,0.5)',
          }}
        >
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
              className={`relative px-4 py-1.5 rounded-full text-[9px] font-black tracking-[0.25em] uppercase transition-colors duration-200 ${
                active === id ? 'text-cyan-400' : 'text-white/25 hover:text-white/50'
              }`}
            >
              {active === id && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'rgba(0,242,255,0.08)',
                    border:     '1px solid rgba(0,242,255,0.3)',
                    boxShadow:  '0 0 10px rgba(0,242,255,0.12)',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
