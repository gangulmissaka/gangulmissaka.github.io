import Link from 'next/link';
import React from 'react';

export default function Header() {
  return (
    <header className="bg-gray-800 py-4">
      <nav className="container mx-auto flex justify-center space-x-8">
        <Link href="/" className="text-white hover:text-gray-300 transition">
          Home
        </Link>
        <Link href="/about" className="text-white hover:text-gray-300 transition">
          About
        </Link>
        <Link href="/projects" className="text-white hover:text-gray-300 transition">
          Projects
        </Link>
        <Link href="/contact" className="text-white hover:text-gray-300 transition">
          Contact
        </Link>
      </nav>
    </header>
  );
}
