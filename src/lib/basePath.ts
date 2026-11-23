// The 3D site is served from a sub-path (gangulmissaka.github.io/valley/). Prefix raw asset URLs with it;
// next/link and next/image do this automatically, but fetch()/loader URLs and <img src> strings don't.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const asset = (path: string) => `${BASE_PATH}${path}`;

// Where "Back to main portfolio" goes. The github.io root forwards to the main site, so this always works.
export const MAIN_SITE_URL = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? 'https://gangulmissaka.github.io/';
