'use client';

import React, { useState, useEffect, useRef } from 'react';

const COMMANDS: Record<string, string[]> = {
  help: [
    'AVAILABLE COMMANDS:',
    '  whoami     —  Identity record',
    '  skills     —  Technical arsenal',
    '  education  —  Academic log',
    '  contact    —  Secure channels',
    '  clear      —  Reset terminal',
  ],
  whoami: [
    'IDENTITY RECORD:',
    '  Name     : Gangul Missaka Hinguralaarachchi',
    '  Role     : Software Engineering Student',
    '  Uni      : Edith Cowan University',
    '  Location : Colombo, Sri Lanka',
    '  Status   : [ONLINE] — Open to opportunities',
  ],
  skills: [
    'TECHNICAL ARSENAL:',
    '  [████████░░]  Software Engineering',
    '  [████████░░]  Cybersecurity & IT',
    '  [███████░░░]  Databases & Data',
    '  [█████████░]  Professional Skills',
    '',
    '  Programming · OOP · Data Structures · SQL',
    '  Networking · Cybersecurity · Systems Analysis',
  ],
  education: [
    'ACADEMIC LOG:',
    '  ► CURRENT  Edith Cowan University',
    '             BSc Computer Science (Software Engineering)',
    '',
    '  ► ALUMNI   Royal College Colombo 7',
    '             Secondary Education',
  ],
  contact: [
    'SECURE CHANNELS:',
    '  ✉  missakabro@gmail.com',
    '  ⌂  github.com/gangulmissaka',
    '  ◉  linkedin.com/in/missaka-hinguralaarachchi-4b12a1396',
    '  ◎  Colombo, Sri Lanka',
  ],
};

const BOOT_LINES = [
  'GANGULMISSAKA_OS v2.6 — INITIALIZING...',
  'Loading neural interface .......... OK',
  'Connecting secure channel ......... OK',
  'Portfolio matrix loaded ........... OK',
  '',
  'Type "help" to explore. Welcome.',
];

type LineType = 'boot' | 'input' | 'output' | 'blank';

export default function TerminalWidget() {
  const [lines, setLines]         = useState<Array<{ text: string; type: LineType }>>([]);
  const [input, setInput]         = useState('');
  const [booting, setBooting]     = useState(true);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Boot sequence
  useEffect(() => {
    let i = 0;
    const next = () => {
      if (i >= BOOT_LINES.length) { setBooting(false); return; }
      const text = BOOT_LINES[i];
      setLines(prev => [...prev, { text, type: text === '' ? 'blank' : 'boot' }]);
      i++;
      setTimeout(next, i === 1 ? 120 : 65);
    };
    setTimeout(next, 200);
  }, []);

  // Scroll only inside the terminal output box — never the page
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const execute = (cmd: string) => {
    const c = cmd.trim().toLowerCase();
    if (!c) return;
    setCmdHistory(prev => [c, ...prev].slice(0, 20));
    setHistoryIdx(-1);
    setLines(prev => [...prev, { text: `$ ${cmd}`, type: 'input' }]);
    if (c === 'clear') {
      setLines([{ text: 'TERMINAL CLEARED. Type "help" for commands.', type: 'boot' }]);
      return;
    }
    const response = COMMANDS[c];
    if (response) {
      response.forEach(line =>
        setLines(prev => [...prev, { text: line, type: line === '' ? 'blank' : 'output' }])
      );
    } else {
      setLines(prev => [...prev, { text: `Command not found: "${cmd}". Try "help".`, type: 'output' }]);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); execute(input); setInput(''); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(idx);
      if (cmdHistory[idx]) setInput(cmdHistory[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? '' : cmdHistory[idx] ?? '');
    }
  };

  return (
    <div
      className="w-full rounded-2xl overflow-hidden border border-cyan-500/20 font-mono select-none"
      style={{
        background:    'rgba(0, 4, 8, 0.92)',
        backdropFilter:'blur(20px)',
        boxShadow:     '0 0 50px rgba(0,242,255,0.06), inset 0 0 40px rgba(0,0,0,0.4)',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-white/5"
        style={{ background: 'rgba(0,0,0,0.4)' }}
      >
        <div className="flex gap-1.5">
          {(['#ff5f57', '#febc2e', '#28c840'] as const).map((c, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />
          ))}
        </div>
        <span className="text-[9px] font-black tracking-[0.25em] text-white/20 ml-2 uppercase">
          gangulmissaka@portfolio — bash
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-pulse inline-block" />
          <span className="text-[8px] text-cyan-400/40 tracking-widest font-black">LIVE</span>
        </div>
      </div>

      {/* Output area — scrollTop managed directly, no scrollIntoView */}
      <div
        ref={outputRef}
        className="px-4 py-3 h-52 overflow-y-auto space-y-0.5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,242,255,0.15) transparent' }}
      >
        {lines.map((line, i) => (
          <p
            key={i}
            className={`text-[11px] leading-5 whitespace-pre-wrap ${
              line.type === 'input'  ? 'text-cyan-400'   :
              line.type === 'boot'   ? 'text-white/45'   :
              line.type === 'blank'  ? ''                 :
                                       'text-white/30'
            }`}
          >
            {line.text}
          </p>
        ))}
      </div>

      {/* Input row */}
      {!booting && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5">
          <span className="text-cyan-400 text-[11px] font-black flex-none">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-white/75 text-[11px] outline-none caret-cyan-400 placeholder-white/15"
            placeholder="type a command…"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          <span
            className="inline-block animate-pulse"
            style={{ width: '7px', height: '13px', background: 'rgba(0,242,255,0.45)' }}
          />
        </div>
      )}
    </div>
  );
}
