import React, { useState, useCallback, useEffect } from 'react';
import Window from './Window';
import TerminalApp from './TerminalApp';

/* ═══ Types ═══ */
interface WinState {
  id: string; title: string; icon: string;
  x: number; y: number; w: number; h: number;
  minimized: boolean; maximized: boolean;
}
interface CtxMenu { show: boolean; x: number; y: number; }

/* ═══ Data ═══ */
const ICONS = [
  { id: 'about',    icon: '👤', title: 'About Me' },
  { id: 'projects', icon: '📁', title: 'Projects' },
  { id: 'skills',   icon: '⚡', title: 'Skills' },
  { id: 'terminal', icon: '💻', title: 'Terminal' },
  { id: 'contact',  icon: '✉️', title: 'Contact' },
  { id: 'github',   icon: '🐙', title: 'GitHub' },
];

const PROJECTS = [
  { title: 'Interactive 3D Dashboard', desc: 'Real-time data vis with WebGL shaders and live WebSocket feeds.', tech: ['Three.js','React','Node.js','WebSocket'], img: 'https://picsum.photos/seed/dash3d/400/200' },
  { title: 'E-Commerce Platform',      desc: 'Full-stack storefront with Stripe payments, auth & admin panel.', tech: ['Next.js','Stripe','PostgreSQL','Tailwind'], img: 'https://picsum.photos/seed/ecom/400/200' },
  { title: 'AI Chat Assistant',         desc: 'Conversational AI with streaming responses and tool use.',       tech: ['Python','FastAPI','React','LLM'],          img: 'https://picsum.photos/seed/aichat/400/200' },
  { title: 'PortfolioOS',              desc: 'This site! An OS-themed immersive portfolio experience.',         tech: ['Next.js','TypeScript','CSS'],              img: 'https://picsum.photos/seed/pfos/400/200' },
];

const SKILLS = [
  { name: 'JavaScript',  pct: 95 }, { name: 'TypeScript', pct: 92 },
  { name: 'React/Next',  pct: 93 }, { name: 'Three.js',  pct: 85 },
  { name: 'Node.js',     pct: 88 }, { name: 'Python',    pct: 82 },
  { name: 'CSS / SCSS',  pct: 91 }, { name: 'WebGL',     pct: 78 },
  { name: 'Docker',      pct: 72 }, { name: 'Blender',   pct: 62 },
];

/* ═══ Defaults per app ═══ */
const SIZE: Record<string, [number, number]> = {
  terminal: [660, 440],
  projects: [720, 520],
  skills:   [520, 480],
  about:    [460, 500],
  contact:  [440, 520],
};

/* ═══════════════════════════════════════════════════════
   Desktop — the heart of the OS
   ═══════════════════════════════════════════════════════ */
export default function Desktop() {
  const [wins, setWins] = useState<WinState[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [zCounter, setZCounter] = useState(100);
  const [zMap, setZMap] = useState<Record<string, number>>({});

  const [startOpen, setStartOpen] = useState(false);
  const [ctx, setCtx] = useState<CtxMenu>({ show: false, x: 0, y: 0 });
  const [time, setTime] = useState(new Date());
  const [notif, setNotif] = useState<string | null>(null);

  // Animated skill bars
  const [skillsVisible, setSkillsVisible] = useState(false);

  // Contact sent
  const [contactSent, setContactSent] = useState(false);

  /* Clock */
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  /* Welcome notification */
  useEffect(() => {
    const t1 = setTimeout(() => {
      setNotif('Welcome to PortfolioOS! Double-click the desktop icons or use the Start menu to explore.');
      const t2 = setTimeout(() => setNotif(null), 6000);
      return () => clearTimeout(t2);
    }, 800);
    return () => clearTimeout(t1);
  }, []);

  /* ─── Window management ─── */
  const bringToFront = useCallback((id: string) => {
    setFocus(id);
    setZCounter(prev => {
      const next = prev + 1;
      setZMap(zm => ({ ...zm, [id]: next }));
      return next;
    });
  }, []);

  const openApp = useCallback((id: string) => {
    if (id === 'github') { window.open('https://github.com', '_blank'); return; }
    setStartOpen(false);
    setCtx(c => ({ ...c, show: false }));

    const existing = wins.find(w => w.id === id);
    if (existing) {
      setWins(prev => prev.map(w => w.id === id ? { ...w, minimized: false } : w));
      bringToFront(id);
      if (id === 'skills') setSkillsVisible(true);
      return;
    }

    const [w, h] = SIZE[id] || [500, 400];
    const off = wins.length * 28;
    setWins(prev => [...prev, {
      id, title: ICONS.find(i => i.id === id)?.title || id,
      icon: ICONS.find(i => i.id === id)?.icon || '📄',
      x: 120 + off, y: 50 + off, w, h,
      minimized: false, maximized: false,
    }]);
    bringToFront(id);
    if (id === 'skills') setTimeout(() => setSkillsVisible(true), 100);
  }, [wins, bringToFront]);

  const closeApp = useCallback((id: string) => {
    setWins(prev => prev.filter(w => w.id !== id));
    if (id === 'skills') setSkillsVisible(false);
  }, []);

  const minimizeApp = useCallback((id: string) => {
    setWins(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  }, []);

  const maximizeApp = useCallback((id: string) => {
    setWins(prev => prev.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w));
  }, []);

  const moveApp = useCallback((id: string, x: number, y: number) => {
    setWins(prev => prev.map(w => w.id === id ? { ...w, x, y } : w));
  }, []);

  const toggleFromTaskbar = useCallback((id: string) => {
    const win = wins.find(w => w.id === id);
    if (!win) return;
    if (win.minimized) {
      setWins(prev => prev.map(w => w.id === id ? { ...w, minimized: false } : w));
      bringToFront(id);
    } else if (focus === id) {
      minimizeApp(id);
    } else {
      bringToFront(id);
    }
  }, [wins, focus, bringToFront, minimizeApp]);

  /* ─── Global click handlers ─── */
  const handleDesktopClick = () => { setStartOpen(false); setCtx(c => ({ ...c, show: false })); };
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ show: true, x: e.clientX, y: e.clientY });
    setStartOpen(false);
  };

  const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  /* ─── App content renderer ─── */
  const renderContent = (id: string) => {
    switch (id) {
      case 'terminal':
        return <TerminalApp />;

      case 'about':
        return (
          <div className="about-card" style={{ padding: 24 }}>
            <div className="about-avatar">👨‍💻</div>
            <div className="about-name">Your Name</div>
            <div className="about-role">Creative Engineer · Full-Stack Developer</div>
            <div className="about-bio">
              I&apos;m a passionate creative engineer who builds immersive digital experiences at the intersection of design, code, and interactive 3D. With expertise in modern web technologies and WebGL, I craft products that are not just functional — they&apos;re memorable.
              <br /><br />
              My approach blends cutting-edge technology with thoughtful design, ensuring every project pushes the boundaries of what&apos;s possible on the web.
            </div>
            <div className="about-stats">
              <div><div className="about-stat-num">5+</div><div className="about-stat-lbl">Years Exp</div></div>
              <div><div className="about-stat-num">30+</div><div className="about-stat-lbl">Projects</div></div>
              <div><div className="about-stat-num">15+</div><div className="about-stat-lbl">Clients</div></div>
            </div>
          </div>
        );

      case 'projects':
        return (
          <div className="proj-grid">
            {PROJECTS.map((p, i) => (
              <div key={i} className="proj-card">
                <div style={{ overflow: 'hidden' }}>
                  <img src={p.img} alt={p.title} className="proj-card-img" />
                </div>
                <div className="proj-card-body">
                  <div className="proj-card-title">{p.title}</div>
                  <div className="proj-card-desc">{p.desc}</div>
                  <div className="proj-tags">
                    {p.tech.map(t => <span key={t} className="proj-tag">{t}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'skills':
        return (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 20 }}>Technical Proficiency</div>
            {SKILLS.map((s, i) => (
              <div key={s.name} className="skill-row" style={{ transitionDelay: `${i * 0.08}s` }}>
                <div className="skill-name">{s.name}</div>
                <div className="skill-bar-bg">
                  <div className="skill-bar" style={{ width: skillsVisible ? `${s.pct}%` : '0%' }} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', width: 32, textAlign: 'right' }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        );

      case 'contact':
        return (
          <div style={{ padding: 24 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✉️</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Get In Touch</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>I&apos;d love to hear from you</div>
            </div>
            {contactSent ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Message Sent!</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>I&apos;ll get back to you soon.</div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }}>
                <input className="contact-input" placeholder="Your name" required />
                <input className="contact-input" placeholder="Email address" type="email" required />
                <input className="contact-input" placeholder="Subject" />
                <textarea className="contact-input contact-textarea" placeholder="Your message..." required />
                <button type="submit" className="contact-btn">Send Message</button>
              </form>
            )}
            <div className="contact-social">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" title="GitHub">🐙</a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" title="LinkedIn">💼</a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" title="Twitter">🐦</a>
              <a href="mailto:hello@yourname.com" title="Email">📧</a>
            </div>
          </div>
        );

      default:
        return <div style={{ padding: 20 }}>Unknown application.</div>;
    }
  };

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="desktop" onClick={handleDesktopClick} onContextMenu={handleContextMenu}>

      {/* ─── Desktop icons ─── */}
      <div className="desktop-icons">
        {ICONS.map(ic => (
          <div key={ic.id} className="desktop-icon" onDoubleClick={() => openApp(ic.id)}>
            <div className="desktop-icon-emoji">{ic.icon}</div>
            <span className="desktop-icon-label">{ic.title}</span>
          </div>
        ))}
      </div>

      {/* ─── Windows ─── */}
      {wins.map(w => (
        <Window
          key={w.id}
          id={w.id}
          title={w.title}
          icon={w.icon}
          x={w.x} y={w.y}
          width={w.w} height={w.h}
          minimized={w.minimized}
          maximized={w.maximized}
          focused={focus === w.id}
          zIndex={zMap[w.id] || 100}
          onClose={closeApp}
          onMinimize={minimizeApp}
          onMaximize={maximizeApp}
          onFocus={bringToFront}
          onMove={moveApp}
        >
          {renderContent(w.id)}
        </Window>
      ))}

      {/* ─── Start Menu ─── */}
      {startOpen && (
        <div className="start-menu" onClick={e => e.stopPropagation()}>
          <input className="sm-search" placeholder="🔍  Search apps..." autoFocus />
          <div className="sm-section-label">Applications</div>
          {ICONS.map(ic => (
            <div key={ic.id} className="sm-item" onClick={() => openApp(ic.id)}>
              <span className="sm-item-icon">{ic.icon}</span>
              <div>
                <div>{ic.title}</div>
                <div className="sm-item-meta">{ic.id === 'terminal' ? 'Interactive shell' : ic.id === 'github' ? 'Open in browser' : 'Portfolio app'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Context Menu ─── */}
      {ctx.show && (
        <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          {ICONS.filter(i => i.id !== 'github').map(ic => (
            <div key={ic.id} className="ctx-item" onClick={() => { openApp(ic.id); setCtx({ ...ctx, show: false }); }}>
              <span>{ic.icon}</span> Open {ic.title}
            </div>
          ))}
          <div className="ctx-divider" />
          <div className="ctx-item" onClick={() => { setCtx({ ...ctx, show: false }); }}>
            <span>🔄</span> Refresh Desktop
          </div>
          <div className="ctx-item" onClick={() => { setCtx({ ...ctx, show: false }); }}>
            <span>ℹ️</span> System Info
          </div>
        </div>
      )}

      {/* ─── Notification ─── */}
      {notif && (
        <div className="notif" onClick={() => setNotif(null)}>
          <div className="notif-title">💻 PortfolioOS</div>
          <div className="notif-body">{notif}</div>
        </div>
      )}

      {/* ─── Taskbar ─── */}
      <div className="taskbar" onClick={e => e.stopPropagation()}>
        <div className="taskbar-left">
          <button className="start-btn" onClick={() => setStartOpen(!startOpen)} title="Start Menu">
            ⊞
          </button>
          {wins.map(w => (
            <button
              key={w.id}
              className={`tb-app ${focus === w.id && !w.minimized ? 'active' : ''}`}
              onClick={() => toggleFromTaskbar(w.id)}
            >
              <span>{w.icon}</span> {w.title}
            </button>
          ))}
        </div>
        <div className="taskbar-right">
          <span className="tray" title="Volume">🔊</span>
          <span className="tray" title="Network">📶</span>
          <span className="tray" title="Battery">🔋</span>
          <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500 }}>{fmtTime(time)}</div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>{fmtDate(time)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
