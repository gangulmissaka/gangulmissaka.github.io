'use client';

import React from 'react';
import { motion } from 'framer-motion';
import ScrollSequence from '@/components/ScrollSequence';
import HolographicPanel from '@/components/HolographicPanel';
import TerminalWidget from '@/components/TerminalWidget';
import TiltCard from '@/components/TiltCard';
import TextScramble from '@/components/TextScramble';
import { ExternalLink, Code, Layers, Shield, Palette, MapPin } from 'lucide-react';
import { GitHubIcon, LinkedInIcon } from '@/components/icons';

// ── Animation helpers ─────────────────────────────────────────────────────────
const hidden  = { opacity: 0, y: 40 };
const visible = (delay = 0) => ({
  opacity: 1,
  y: 0,
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay },
});

function Reveal({
  children, delay = 0, className = '',
}: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={hidden}
      whileInView={visible(delay)}
      viewport={{ once: true, amount: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Cyber section label with scramble decode on scroll
function SectionTag({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px w-6 bg-cyan-400/50" />
      <TextScramble
        text={label}
        className="text-[10px] font-black tracking-[0.5em] uppercase text-cyan-400"
        delay={delay}
      />
      <div className="h-px w-6 bg-cyan-400/50" />
    </div>
  );
}

// ── Skill categories ──────────────────────────────────────────────────────────
const SKILL_CATEGORIES = [
  {
    icon:       <Code   className="w-7 h-7 text-cyan-400" />,
    barColor:   'rgba(0,242,255,0.65)',
    borderHover:'hover:border-cyan-500/30',
    title:      'SOFTWARE ENGINEERING',
    items: [
      { name: 'Programming',            level: 85 },
      { name: 'OOP',                    level: 80 },
      { name: 'Object Oriented Design', level: 76 },
      { name: 'Data Structures',        level: 78 },
      { name: 'Algorithms',             level: 72 },
      { name: 'Systems Analysis',       level: 76 },
    ],
  },
  {
    icon:       <Layers  className="w-7 h-7 text-purple-400" />,
    barColor:   'rgba(168,85,247,0.65)',
    borderHover:'hover:border-purple-500/30',
    title:      'DATABASES & DATA',
    items: [
      { name: 'SQL & Databases',  level: 78 },
      { name: 'Database Design',  level: 74 },
      { name: 'Data Structures',  level: 78 },
      { name: 'Systems Analysis', level: 76 },
      { name: 'Class Diagrams',   level: 70 },
      { name: 'MS Visio',         level: 72 },
    ],
  },
  {
    icon:       <Shield  className="w-7 h-7 text-emerald-400" />,
    barColor:   'rgba(52,211,153,0.65)',
    borderHover:'hover:border-emerald-500/30',
    title:      'CYBERSECURITY & IT',
    items: [
      { name: 'Cybersecurity',        level: 80 },
      { name: 'Information Security', level: 78 },
      { name: 'Networking',           level: 76 },
      { name: 'Operating Systems',    level: 82 },
      { name: 'Technical Support',    level: 88 },
      { name: 'Troubleshooting',      level: 85 },
    ],
  },
  {
    icon:       <Palette className="w-7 h-7 text-pink-400" />,
    barColor:   'rgba(244,114,182,0.65)',
    borderHover:'hover:border-pink-500/30',
    title:      'PROFESSIONAL SKILLS',
    items: [
      { name: 'Project Management', level: 82 },
      { name: 'Project Planning',   level: 80 },
      { name: 'Microsoft Office',   level: 90 },
      { name: 'Team Leadership',    level: 78 },
      { name: 'Teamwork',           level: 92 },
      { name: 'Problem Solving',    level: 85 },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <main className="bg-black text-white selection:bg-cyan-500/30 font-sans">

      {/* ══════════════════════════════════════════════════════
          CINEMATIC INTRO
      ══════════════════════════════════════════════════════ */}
      <ScrollSequence />

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════ */}
      <div className="relative z-10 bg-black">
        <div className="h-24 bg-gradient-to-b from-black to-transparent -mt-24 relative z-10" />

        <div className="tech-grid">
          <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-24 pt-24 pb-64 space-y-64">

            {/* ── IDENTITY ──────────────────────────────────────────────── */}
            <section id="identity" className="border-b border-white/5 pb-24">
              <Reveal>
                <SectionTag label="Developer Profile" />
              </Reveal>

              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start mt-6">

                {/* Left — name + bio */}
                <div>
                  <Reveal delay={0.1}>
                    <h1 className="text-5xl md:text-8xl xl:text-9xl font-black tracking-tighter uppercase leading-none">
                      <span className="glitch-text" data-text="GANGUL">GANGUL</span>
                      <br />
                      <span className="text-white/20">MISSAKA</span>
                    </h1>
                  </Reveal>

                  <Reveal delay={0.18} className="mt-8">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-[9px] font-black tracking-[0.4em] uppercase text-white/30">STATUS</span>
                      {/* Ping ring on the active dot */}
                      <span className="status-ping">
                        <span
                          className="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"
                          style={{ boxShadow: '0 0 8px rgba(52,211,153,0.9)' }}
                        />
                      </span>
                      <span className="text-[9px] font-black tracking-[0.3em] uppercase text-emerald-400/70">ACTIVE</span>
                    </div>
                  </Reveal>

                  <Reveal delay={0.22} className="mt-8">
                    <p className="max-w-2xl text-xl md:text-2xl text-white/40 font-medium leading-snug border-l-4 border-cyan-500/30 pl-8">
                      Computer Science (Software Engineering) student at{' '}
                      <span className="text-white font-black">Edith Cowan University</span>,
                      building a strong foundation in programming, data structures, systems analysis,
                      databases, networking, and cybersecurity through coursework and hands-on practice.
                    </p>
                  </Reveal>
                </div>

                {/* Right — interactive terminal */}
                <Reveal delay={0.35}>
                  <TerminalWidget />
                </Reveal>
              </div>
            </section>

            {/* ── METHODOLOGY ───────────────────────────────────────────── */}
            <section id="methodology" className="space-y-20">
              <Reveal>
                <SectionTag label="Approach" />
              </Reveal>
              <Reveal delay={0.1}>
                <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none">
                  <span className="glitch-text" data-text="HOW I">HOW I</span>
                  <br />
                  <span className="text-white/20">BUILD</span>
                </h2>
              </Reveal>

              <div className="grid lg:grid-cols-3 gap-12 lg:gap-16 items-start">
                <Reveal delay={0.15}>
                  <p className="text-2xl text-white/40 font-medium leading-snug border-l-4 border-white/10 pl-8">
                    Every project starts with deep analysis, followed by disciplined architecture,
                    purposeful implementation, and relentless{' '}
                    <span className="text-white font-black">optimization</span>.
                  </p>
                </Reveal>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { step: '01', title: 'Analyze',   desc: 'Requirements & Constraints' },
                    { step: '02', title: 'Design',    desc: 'System Architecture'        },
                    { step: '03', title: 'Implement', desc: 'Performant Development'     },
                    { step: '04', title: 'Optimize',  desc: 'Refinement & Scaling'       },
                  ].map((item, i) => (
                    <Reveal key={item.step} delay={0.1 * i}>
                      {/* 3-D tilt wraps the card */}
                      <TiltCard className="h-full">
                        <div className="p-8 h-full rounded-3xl border border-white/5 bg-white/[0.02] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group space-y-3 hud-corner scan-on-hover">
                          <span className="font-mono text-xl font-black text-cyan-500/20 group-hover:text-cyan-400 transition-colors">{item.step}</span>
                          <h4 className="font-black uppercase text-sm tracking-widest group-hover:text-white transition-colors">{item.title}</h4>
                          <p className="text-xs text-white/30">{item.desc}</p>
                        </div>
                      </TiltCard>
                    </Reveal>
                  ))}
                </div>

                <Reveal delay={0.3} className="flex justify-center self-center w-full md:col-span-2 lg:col-span-1 mt-4 lg:mt-0">
                  <HolographicPanel />
                </Reveal>
              </div>
            </section>

            {/* ── SKILLS ────────────────────────────────────────────────── */}
            <section className="space-y-20" id="skills">
              <div className="flex flex-col md:flex-row justify-between items-end gap-6 pb-8 border-b border-white/5">
                <Reveal>
                  <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none">
                    <TextScramble text="Technical" className="block" delay={0.1} />
                    <span className="text-cyan-400 neon-glow">Arsenal</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.1}>
                  <p className="max-w-sm text-sm text-white/30 md:pb-3">
                    Core skills spanning Software Engineering, Databases, Cybersecurity, and Professional Practice.
                  </p>
                </Reveal>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                {SKILL_CATEGORIES.map((cat, catIdx) => (
                  <Reveal key={cat.title} delay={0.08 * catIdx}>
                    <TiltCard className="h-full" intensity={7}>
                      <div className={`flex flex-col p-10 rounded-[2.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] ${cat.borderHover} transition-all group h-full scan-on-hover`}>
                        {/* Icon with shimmer */}
                        <div className="mb-8 p-4 w-fit rounded-2xl bg-white/5 group-hover:bg-white/10 transition-colors shimmer-on-hover">
                          {cat.icon}
                        </div>
                        {/* Title flickers like neon on hover */}
                        <h3 className="text-sm font-black uppercase tracking-widest mb-8 group-hover:text-white transition-colors flicker-on-group">
                          {cat.title}
                        </h3>
                        <ul className="space-y-4 flex-grow">
                          {cat.items.map((item, itemIdx) => (
                            <li key={item.name} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors">
                                  {item.name}
                                </span>
                                <span className="text-[9px] font-black text-white/20 group-hover:text-white/50 transition-colors font-mono">
                                  {item.level}%
                                </span>
                              </div>
                              {/* Animated fill bar */}
                              <div className="h-px w-full bg-white/5 overflow-hidden rounded-full">
                                <motion.div
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${item.level}%` }}
                                  viewport={{ once: true }}
                                  transition={{
                                    duration: 1.2,
                                    delay: 0.15 + catIdx * 0.08 + itemIdx * 0.05,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  className="h-full rounded-full"
                                  style={{ background: cat.barColor }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TiltCard>
                  </Reveal>
                ))}
              </div>
            </section>

            {/* ── EDUCATION & CONTACT ───────────────────────────────────── */}
            <section className="grid lg:grid-cols-2 gap-24 lg:gap-32" id="contact">

              {/* Education */}
              <div className="space-y-16">
                <Reveal>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
                    Academic <br /><span className="text-white/20">Legacy</span>
                  </h2>
                </Reveal>
                <div className="space-y-12 relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-0 top-2 bottom-2 w-px bg-white/5" />
                  {[
                    { school: 'Edith Cowan University',  degree: 'BSc Computer Science (Software Engineering)', tag: 'Current', highlight: true  },
                    { school: 'Royal College Colombo 7', degree: 'Secondary Education',                         tag: 'Alumni',  highlight: false },
                  ].map((edu, i) => (
                    <Reveal key={edu.school} delay={0.1 * i}>
                      <div className="group cursor-default border-l-2 border-white/5 pl-6 hover:border-cyan-500/40 transition-colors relative space-y-1">
                        {/* Timeline node */}
                        <div
                          className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full border transition-all duration-300"
                          style={{
                            borderColor: edu.highlight ? 'rgba(0,242,255,0.6)' : 'rgba(255,255,255,0.15)',
                            background:  edu.highlight ? 'rgba(0,242,255,0.15)' : 'transparent',
                            boxShadow:   edu.highlight ? '0 0 8px rgba(0,242,255,0.5)' : 'none',
                          }}
                        />
                        <span className={`text-[10px] font-black uppercase tracking-[0.5em] transition-colors ${edu.highlight ? 'text-cyan-400' : 'text-white/20 group-hover:text-white/50'}`}>
                          {edu.tag}
                        </span>
                        <h4 className="text-xl md:text-2xl font-black uppercase group-hover:text-white transition-colors">{edu.school}</h4>
                        <p className="text-sm text-white/30">{edu.degree}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-16">
                <Reveal>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
                    Secure <br />
                    <TextScramble text="Channel" className="text-cyan-400 neon-glow" delay={0.3} />
                  </h2>
                </Reveal>

                <Reveal delay={0.1} className="space-y-4">
                  {/* Email card — animated neon border */}
                  <a
                    href="mailto:missakabro@gmail.com"
                    className="flex items-center justify-between p-10 rounded-[2.5rem] bg-cyan-500/5 border transition-all group scan-on-hover animate-neon-border"
                  >
                    <div className="space-y-2">
                      <span className="text-[10px] font-black tracking-widest uppercase text-cyan-400">Direct Email</span>
                      <p className="text-xl md:text-2xl font-black">missakabro@gmail.com</p>
                    </div>
                    <ExternalLink className="w-7 h-7 text-cyan-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform flex-none" />
                  </a>

                  <div className="grid grid-cols-2 gap-4">
                    <TiltCard intensity={8}>
                      <a
                        href="https://github.com/gangulmissaka"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col justify-between gap-8 p-10 h-48 rounded-[2.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all group scan-on-hover"
                      >
                        <GitHubIcon className="w-10 h-10 text-white/20 group-hover:text-white transition-colors" />
                        <span className="text-sm font-black uppercase tracking-widest">GitHub</span>
                      </a>
                    </TiltCard>
                    <TiltCard intensity={8}>
                      <a
                        href="https://www.linkedin.com/in/missaka-hinguralaarachchi-4b12a1396/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col justify-between gap-8 p-10 h-48 rounded-[2.5rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all group scan-on-hover"
                      >
                        <LinkedInIcon className="w-10 h-10 text-white/20 group-hover:text-blue-400 transition-colors" />
                        <span className="text-sm font-black uppercase tracking-widest">LinkedIn</span>
                      </a>
                    </TiltCard>
                  </div>

                  <div className="flex items-center gap-3 pt-4 text-white/20">
                    <MapPin className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">Colombo, Sri Lanka</span>
                  </div>
                </Reveal>
              </div>

            </section>
          </div>

          {/* Footer */}
          <footer className="border-t border-white/5 py-20 text-center">
            <Reveal>
              <p className="text-[10px] font-black uppercase tracking-[1em] text-white/10">
                Gangul Missaka Hinguralaarachchi © 2026
              </p>
            </Reveal>
          </footer>
        </div>
      </div>
    </main>
  );
}
