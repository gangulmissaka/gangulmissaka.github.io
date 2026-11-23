/** @type {import('next').NextConfig} */
// Served from https://gangulmissaka.github.io/valley/ (the root forwards to the main portfolio).
// Override with PAGES_BASE_PATH='' to run it at the root locally.
const basePath = process.env.PAGES_BASE_PATH ?? '/valley';

module.exports = {
  // Static export: the GitHub Pages workflow copies ./out into the site's /valley folder.
  output: 'export',
  basePath,
  trailingSlash: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  reactStrictMode: true,
  // Allows a production build alongside a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  swcMinify: true,
  // Enable MDX support
  pageExtensions: ['tsx', 'ts', 'js', 'jsx', 'md', 'mdx'],
};
