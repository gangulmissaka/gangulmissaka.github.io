// All site content lives here (source: Gangul_Missaka_Details.docx).

export const SITE = {
  ownerName: 'Gangul Missaka',
  fullName: 'Gangul Missaka Hinguralaarachchi',
  initials: 'GM',
  role: 'Software Engineering Student',
  university: 'Edith Cowan University',
  location: 'Colombo, Sri Lanka',
  status: 'Open to opportunities',
  photo: '/images/gangul.jpg',
  tagline: 'Drive around the valley to discover my projects, skills and how I build software.',
  taglines: ['Crafting the Future', 'Software Engineering Excellence', 'AI & Data Driven Architecture'],
  summary:
    'Computer Science (Software Engineering) student at Edith Cowan University, building a strong foundation in programming, data structures, systems analysis, databases, networking, and cybersecurity through coursework and hands-on practice.',
  links: {
    email: 'mailto:missakabro@gmail.com',
    emailText: 'missakabro@gmail.com',
    github: 'https://github.com/gangulmissaka',
    linkedin: 'https://www.linkedin.com/in/missaka-hinguralaarachchi-4b12a1396/',
    website: 'https://gangulmissaka.github.io',
  },
};

export const EDUCATION = [
  { status: 'Current', institution: 'Edith Cowan University', qualification: 'BSc Computer Science (Software Engineering)' },
  { status: 'Alumni', institution: 'Royal College Colombo 7', qualification: 'Secondary Education' },
];

export const APPROACH = {
  intro: 'Every project starts with deep analysis, followed by disciplined architecture, purposeful implementation, and relentless optimization.',
  steps: [
    { n: '01', stage: 'Analyze', focus: 'Requirements & constraints' },
    { n: '02', stage: 'Design', focus: 'System architecture' },
    { n: '03', stage: 'Implement', focus: 'Performant development' },
    { n: '04', stage: 'Optimize', focus: 'Refinement & scaling' },
  ],
};

export const ADDITIONAL_SKILLS = [
  { area: 'Game development', detail: 'Unity 6, custom AI enemy with pathfinding, event systems' },
  { area: 'AI integration', detail: 'On-device AI speech recognition' },
  { area: 'Networking', detail: 'Cisco Packet Tracer, routers, switches, VLANs, EIGRP routing' },
  { area: 'Version control', detail: 'Git' },
  { area: 'Web development', detail: 'Next.js, TypeScript, Tailwind CSS, Framer Motion, GitHub Actions' },
];

export const INTERESTS = [
  'AI agents & Model Context Protocol (MCP)',
  'AI, Machine Learning & Deep Learning',
  'Data management, quality & governance',
  'Multi-tier architecture & cloud models (SaaS, PaaS, IaaS)',
];

export interface ProjectItem {
  id: string;
  title: string;
  tagline: string;
  category: string;
  date: string;
  description: string;
  highlights: string[];
  tech: string[];
  links: { label: string; url: string }[];
  /** YouTube video id, embedded in the project panel. */
  video?: string;
  color: string;
}

// Order matches PROJECT_SPOTS: Victorian house, stilt house, shack, pond, Nimbo sculpture, ManimDesk sculpture.
export const PORTFOLIO_PROJECTS: ProjectItem[] = [
  {
    id: 'portfolio-site',
    title: 'Personal Portfolio Website',
    tagline: 'Animated portfolio deployed automatically to GitHub Pages',
    category: 'Web Development',
    date: 'Personal project',
    description: 'Designed and built a personal portfolio website, deployed automatically to GitHub Pages.',
    highlights: [
      'Cinematic 120-frame scroll-driven intro animation rendered on an HTML canvas',
      'Interactive terminal widget with help, whoami, skills, education, contact and clear commands',
      '3D tilt cards, particle field background, aurora effects and a custom cursor',
      'Text-scramble "decode" effects, animated skill bars and a floating navigation that tracks the active section',
    ],
    tech: ['Next.js (App Router, static export)', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'GitHub Actions'],
    links: [
      { label: 'Visit site', url: 'https://gangulmissaka.github.io' },
      { label: 'GitHub', url: 'https://github.com/gangulmissaka' },
    ],
    color: '#7cc4d9',
  },
  {
    id: 'apparition',
    title: 'APPARITION',
    tagline: 'Psychological horror game',
    category: 'Game Development',
    date: 'Approx. October 2026',
    description: 'A psychological horror game built in Unity 6, where the player must speak an incantation aloud to finish the game.',
    highlights: [
      'On-device AI speech recognition: the player speaks an incantation aloud to finish the game',
      'Custom AI enemy with pathfinding and event systems',
      'Gameplay video on YouTube — watch it right here',
    ],
    tech: ['Unity 6', 'On-device AI speech recognition', 'AI pathfinding', 'Event systems'],
    links: [{ label: 'Watch on YouTube', url: 'https://www.youtube.com/watch?v=GJBbG5MLQfE' }],
    video: 'GJBbG5MLQfE',
    color: '#e58b8b',
  },
  {
    id: 'network-design',
    title: 'Network Design',
    tagline: 'Cisco Packet Tracer — Applied Communications assignment',
    category: 'Networking',
    date: 'Approx. March 2026 · Edith Cowan University',
    description: 'Designed a network in Cisco Packet Tracer for the Applied Communications assignment at Edith Cowan University.',
    highlights: ['Designed a network using routers and switches', 'Configured VLANs and EIGRP routing'],
    tech: ['Cisco Packet Tracer', 'Routers & switches', 'VLANs', 'EIGRP'],
    links: [],
    color: '#8fcf9a',
  },
  {
    id: 'roll-a-ball',
    title: 'Roll-a-Ball',
    tagline: 'My first Unity game',
    category: 'Game Development',
    date: 'Approx. March 2026',
    description: 'Completed Unity’s "Roll-a-Ball" 3D beginner course, building a first mini-game — my first step into game development.',
    highlights: ['Built a first 3D mini-game by following Unity’s beginner course'],
    tech: ['Unity'],
    links: [],
    color: '#f2b45a',
  },
  {
    id: 'nimbo',
    title: 'Nimbo — Image Organizer',
    tagline: 'Sorts a whole drive of photos into dated folders, safely',
    category: 'Desktop App',
    date: 'Personal project · v1.0.0 for Windows',
    description:
      'A Windows app that sorts a whole drive (or any folder) of photos into a clean, dated folder structure. It scans first and shows the plan, and nothing is moved until you approve it. Every run can be undone.',
    highlights: [
      'Two-phase workflow: the scan builds a plan, apply carries it out and writes an undo journal',
      'Reads EXIF/XMP capture dates straight from file headers, with filename, timestamp and file-date fallbacks',
      'Detects screenshots and numbered dataset sequences so they are not filed by mistake',
      'Finds exact duplicates by content hash, plus optional GPU-accelerated near-duplicate detection',
      'Privacy first: no network calls, no telemetry. Ships as a single .exe with no setup',
    ],
    tech: ['Python', 'Tkinter GUI + CLI', 'EXIF / XMP parsing', 'Perceptual hashing', 'PyTorch / CUDA (optional)'],
    links: [
      { label: 'Download for Windows', url: 'https://github.com/gangulmissaka/nimbo_image_organizer/releases/latest' },
      { label: 'GitHub', url: 'https://github.com/gangulmissaka/nimbo_image_organizer' },
    ],
    color: '#8fb6ff',
  },
  {
    id: 'manimdesk',
    title: 'ManimDesk',
    tagline: 'A desktop app for rendering Manim maths and physics animations',
    category: 'Desktop App',
    date: 'Personal project · v0.2.0 for Windows, macOS and Linux',
    description:
      'A simple cross-platform desktop app that turns Manim scripts into videos. Paste a script, pick the quality and aspect ratio, and click Render. No command line needed.',
    highlights: [
      'Script editor that finds every Scene class automatically, with an option to render them all',
      '480p, 720p or 1080p60 output, in 16:9 for YouTube or 9:16 for Shorts, Reels and TikTok',
      'One-click setup downloads Python, Manim and LaTeX into a folder you choose',
      'Live render log with errors highlighted, and buttons to open the video or its folder',
    ],
    tech: ['Python', 'Manim', 'LaTeX', 'Cross-platform desktop GUI', 'uv / pip packaging'],
    links: [
      { label: 'GitHub', url: 'https://github.com/gangulmissaka/ManimDesk' },
      { label: 'Latest release', url: 'https://github.com/gangulmissaka/ManimDesk/releases/latest' },
    ],
    color: '#f08fd0',
  },
];

export interface SkillGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  items: { name: string; level: number }[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    id: 'software',
    name: 'Software Engineering',
    icon: '⌘',
    color: '#7cc4d9',
    items: [
      { name: 'Programming', level: 85 },
      { name: 'OOP', level: 80 },
      { name: 'Object Oriented Design', level: 76 },
      { name: 'Data Structures', level: 78 },
      { name: 'Algorithms', level: 72 },
      { name: 'Systems Analysis', level: 76 },
    ],
  },
  {
    id: 'data',
    name: 'Databases & Data',
    icon: '▦',
    color: '#c3a3e6',
    items: [
      { name: 'SQL & Databases', level: 78 },
      { name: 'Database Design', level: 74 },
      { name: 'Data Structures', level: 78 },
      { name: 'Systems Analysis', level: 76 },
      { name: 'Class Diagrams', level: 70 },
      { name: 'MS Visio', level: 72 },
    ],
  },
  {
    id: 'security',
    name: 'Cybersecurity & IT',
    icon: '⛨',
    color: '#8fcf9a',
    items: [
      { name: 'Cybersecurity', level: 80 },
      { name: 'Information Security', level: 78 },
      { name: 'Networking', level: 76 },
      { name: 'Operating Systems', level: 82 },
      { name: 'Technical Support', level: 88 },
      { name: 'Troubleshooting', level: 85 },
    ],
  },
  {
    id: 'professional',
    name: 'Professional Skills',
    icon: '◎',
    color: '#f2b45a',
    items: [
      { name: 'Project Management', level: 82 },
      { name: 'Project Planning', level: 80 },
      { name: 'Microsoft Office', level: 90 },
      { name: 'Team Leadership', level: 78 },
      { name: 'Teamwork', level: 92 },
      { name: 'Problem Solving', level: 85 },
    ],
  },
];

export const POSTS: { when: string; topic: string }[] = [
  { when: 'Oct 2026', topic: 'APPARITION gameplay: a psychological horror game in Unity 6 with on-device AI speech recognition and a custom AI enemy' },
  { when: 'Apr 2026', topic: 'Model Context Protocol (MCP) and how it enables autonomous AI agents in business operations' },
  { when: 'Apr 2026', topic: 'Commentary on the leaked Claude Code codebase, with a visual cheat sheet of five takeaways' },
  { when: 'Apr 2026', topic: 'Essential Git commands every beginner should know' },
  { when: 'Mar 2026', topic: 'How AI, Machine Learning and Deep Learning relate (the "glowing sphere" concept)' },
  { when: 'Mar 2026', topic: 'Data Management vs. Data Quality vs. Data Governance' },
  { when: 'Mar 2026', topic: 'On growth and taking responsibility' },
  { when: 'Mar 2026', topic: 'Multi-tier software architecture: decoupling, the shift to cloud, SaaS / PaaS / IaaS' },
  { when: 'Mar 2026', topic: 'Cisco Packet Tracer network design (routers, switches, VLANs, EIGRP)' },
  { when: 'Mar 2026', topic: 'Completed Unity’s "Roll-a-Ball" 3D beginner course — my first mini-game' },
];
