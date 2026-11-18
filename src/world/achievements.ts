// Achievements: small goals that reward exploring the world. Progress is kept in
// localStorage (per browser) and is optional — everything works without it.

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-drive', title: 'Hit the road', hint: 'Drive 100 metres', icon: '🚗' },
  { id: 'name-crash', title: 'Breaking news', hint: 'Knock over a letter of my name', icon: '🔠' },
  { id: 'about', title: 'Nice to meet you', hint: 'Read the About board', icon: '👋' },
  { id: 'all-projects', title: 'Portfolio tour', hint: 'Open all six projects', icon: '🏠' },
  { id: 'all-skills', title: 'Skill check', hint: 'See all four skill showcases', icon: '🧠' },
  { id: 'approach', title: 'How it’s built', hint: 'Pass all four "How I Build" stones', icon: '🪨' },
  { id: 'posts', title: 'Well informed', hint: 'Read the notice board', icon: '📌' },
  { id: 'contact', title: 'Say hello', hint: 'Open a contact link', icon: '✉️' },
  { id: 'hoop', title: 'Airtime', hint: 'Jump through the hoop', icon: '🎯' },
  { id: 'crates', title: 'Demolition', hint: 'Topple the crate pyramid', icon: '📦' },
  { id: 'strike', title: 'Strike!', hint: 'Knock down all ten pins', icon: '🎳' },
  { id: 'drums', title: 'Oil spill', hint: 'Knock over three oil drums', icon: '🛢️' },
  { id: 'speed', title: 'Full throttle', hint: 'Reach 110 km/h', icon: '⚡' },
  { id: 'relics', title: 'Treasure hunter', hint: 'Find all the glowing relics', icon: '💎' },
  { id: 'honk', title: 'Vintage klaxon', hint: 'Honk the horn five times', icon: '📯' },
  { id: 'edge', title: 'End of the world', hint: 'Drive into the forest edge', icon: '🌲' },
  { id: 'splash', title: 'Making waves', hint: 'Drive into the pond', icon: '🌊' },
  { id: 'night', title: 'Night owl', hint: 'Drive under the stars (press N)', icon: '🌙' },
  { id: 'tour', title: 'Sit back and enjoy', hint: 'Finish the guided tour', icon: '🧭' },
  { id: 'photo', title: 'Postcard', hint: 'Take a photo in photo mode (P)', icon: '📸' },
];

const KEY = 'gm-portfolio-achievements';

export function loadUnlocked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveUnlocked(set: Set<string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}
