import React, { useState, useRef, useEffect, useCallback } from 'react';

const COMMANDS: Record<string, string[]> = {
  help: [
    '',
    '  ╔═══════════════════════════════════════════╗',
    '  ║         AVAILABLE COMMANDS                ║',
    '  ╚═══════════════════════════════════════════╝',
    '',
    '  about       →  Who am I',
    '  skills      →  My tech stack',
    '  projects    →  Featured work',
    '  contact     →  Get in touch',
    '  neofetch    →  System info',
    '  whoami      →  Current user',
    '  date        →  Current date/time',
    '  echo <msg>  →  Echo a message',
    '  history     →  Command history',
    '  clear       →  Clear terminal',
    '  sudo rm -rf →  Try it ;)',
    '',
  ],
  about: [
    '',
    '  ┌─────────────────────────────────────────┐',
    '  │              A B O U T  M E             │',
    '  └─────────────────────────────────────────┘',
    '',
    '  Hey! I\'m a Creative Engineer.',
    '',
    '  I build immersive, interactive digital',
    '  experiences that blend design, 3D graphics,',
    '  and cutting-edge web technology.',
    '',
    '  📍 Location    : Earth',
    '  💼 Experience  : 5+ years',
    '  🎯 Focus       : WebGL, Full-Stack, Creative Coding',
    '  🎓 Education   : Computer Science',
    '',
    '  "Code is poetry. WebGL is the canvas."',
    '',
  ],
  skills: [
    '',
    '  ┌─────────────────────────────────────────┐',
    '  │            T E C H  S T A C K           │',
    '  └─────────────────────────────────────────┘',
    '',
    '  Languages   │ JavaScript · TypeScript · Python · Rust',
    '  Frontend    │ React · Next.js · Vue · Svelte',
    '  3D / WebGL  │ Three.js · R3F · Shaders · Blender',
    '  Animation   │ GSAP · Framer Motion · Lottie',
    '  Backend     │ Node.js · Express · FastAPI · GraphQL',
    '  Database    │ PostgreSQL · MongoDB · Redis',
    '  DevOps      │ Docker · AWS · Vercel · GitHub Actions',
    '  Design      │ Figma · Adobe CC · Spline',
    '',
  ],
  projects: [
    '',
    '  ┌─────────────────────────────────────────┐',
    '  │          P R O J E C T S                │',
    '  └─────────────────────────────────────────┘',
    '',
    '  [01]  3D Interactive Dashboard',
    '        Three.js · React · WebSocket',
    '        Real-time data visualization',
    '',
    '  [02]  E-Commerce Platform',
    '        Next.js · Stripe · PostgreSQL',
    '        Full-stack storefront + admin',
    '',
    '  [03]  AI Chat Assistant',
    '        Python · FastAPI · LLM · React',
    '        Streaming conversational AI',
    '',
    '  [04]  PortfolioOS  ← you are here!',
    '        Next.js · TypeScript · CSS',
    '        OS-themed immersive portfolio',
    '',
  ],
  contact: [
    '',
    '  ┌─────────────────────────────────────────┐',
    '  │          C O N T A C T                  │',
    '  └─────────────────────────────────────────┘',
    '',
    '  📧  Email     hello@yourname.com',
    '  🐙  GitHub    github.com/yourname',
    '  💼  LinkedIn  linkedin.com/in/yourname',
    '  🐦  Twitter   twitter.com/yourname',
    '',
    '  Feel free to reach out anytime!',
    '',
  ],
  whoami: ['  visitor@portfolio-os — you\'re an awesome human! 🎉'],
  'sudo rm -rf': [
    '',
    '  🚨 Nice try! But this OS is indestructible.',
    '  🛡️  Permission denied: creativity cannot be deleted.',
    '',
  ],
};

const NEOFETCH_LOGO = [
  '     ██████╗  ███████╗',
  '     ██╔══██╗ ██╔════╝',
  '     ██████╔╝ ███████╗',
  '     ██╔═══╝  ╚════██║',
  '     ██║      ███████║',
  '     ╚═╝      ╚══════╝',
];

const NEOFETCH_INFO = [
  'visitor@portfolio-os',
  '────────────────────',
  'OS:       PortfolioOS 2.0',
  'Host:     The Internet',
  'Kernel:   Next.js 14',
  'Shell:    React 18.3',
  'WM:       Custom Window Manager',
  'Theme:    Cyberpunk Dark [Glass]',
  'Terminal: PortfolioTerm v2.0',
  'CPU:      Creative @ ∞ GHz',
  'GPU:      RTX Imagination 5090',
  'Memory:   ∞ / ∞ GB',
];

export default function TerminalApp() {
  const [history, setHistory] = useState<{ type: 'in' | 'out' | 'err'; text: string }[]>([
    { type: 'out', text: '  Welcome to PortfolioOS Terminal v2.0' },
    { type: 'out', text: '  Type "help" for available commands.' },
    { type: 'out', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdIdx, setCmdIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  const exec = useCallback((raw: string) => {
    const cmd = raw.trim();
    const lower = cmd.toLowerCase();
    const next: { type: 'in' | 'out' | 'err'; text: string }[] = [
      ...history,
      { type: 'in', text: cmd },
    ];

    if (!cmd) { setHistory(next); return; }

    if (lower === 'clear') { setHistory([]); return; }

    if (lower === 'date') {
      next.push({ type: 'out', text: '  ' + new Date().toString() });
      setHistory(next); return;
    }

    if (lower === 'history') {
      cmdHistory.forEach((c, i) => next.push({ type: 'out', text: `  ${i + 1}  ${c}` }));
      setHistory(next); return;
    }

    if (lower.startsWith('echo ')) {
      next.push({ type: 'out', text: '  ' + cmd.slice(5) });
      setHistory(next); return;
    }

    if (lower === 'neofetch') {
      const maxLines = Math.max(NEOFETCH_LOGO.length, NEOFETCH_INFO.length);
      for (let i = 0; i < maxLines; i++) {
        const logo = NEOFETCH_LOGO[i] || '                      ';
        const info = NEOFETCH_INFO[i] || '';
        next.push({ type: 'out', text: `  ${logo}   ${info}` });
      }
      setHistory(next); return;
    }

    const result = COMMANDS[lower];
    if (result) {
      result.forEach(line => next.push({ type: 'out', text: line }));
    } else {
      next.push({ type: 'err', text: `  Command not found: ${cmd}. Type "help" for commands.` });
    }
    setHistory(next);
  }, [history, cmdHistory]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setCmdHistory(prev => [input, ...prev]);
      setCmdIdx(-1);
      exec(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const ni = Math.min(cmdIdx + 1, cmdHistory.length - 1);
      setCmdIdx(ni);
      if (cmdHistory[ni] !== undefined) setInput(cmdHistory[ni]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const ni = Math.max(cmdIdx - 1, -1);
      setCmdIdx(ni);
      setInput(ni === -1 ? '' : cmdHistory[ni]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const partial = input.toLowerCase();
      const all = Object.keys(COMMANDS).concat(['clear', 'date', 'history', 'neofetch']);
      const match = all.find(c => c.startsWith(partial));
      if (match) setInput(match);
    }
  };

  return (
    <div className="terminal" ref={scrollRef} onClick={() => inputRef.current?.focus()}>
      {history.map((entry, i) => (
        <div key={i} className={`term-line ${entry.type === 'err' ? 'term-err' : entry.type === 'out' ? 'term-out' : ''}`}>
          {entry.type === 'in' && <span className="term-prompt">visitor@portfolio-os:~$ </span>}
          {entry.text}
        </div>
      ))}
      <div className="term-input-row">
        <span className="term-prompt">visitor@portfolio-os:~$ </span>
        <input
          ref={inputRef}
          className="term-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
