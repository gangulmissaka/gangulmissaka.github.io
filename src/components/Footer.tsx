import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-800 py-6 text-center text-gray-400 text-sm">
      <p>&copy; {new Date().getFullYear()} Your Name. All rights reserved.</p>
      <div className="mt-2 flex justify-center space-x-4">
        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">
          GitHub
        </a>
        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">
          LinkedIn
        </a>
        <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">
          Twitter
        </a>
      </div>
    </footer>
  );
}
