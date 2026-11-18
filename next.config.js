/** @type {import('next').NextConfig} */
module.exports = {
  // Static export: GitHub Pages serves the ./out folder (see .github/workflows/deploy.yml).
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  // Allows a production build alongside a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  swcMinify: true,
  // Enable MDX support
  pageExtensions: ['tsx', 'ts', 'js', 'jsx', 'md', 'mdx'],
};
