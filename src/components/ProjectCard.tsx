import React from 'react';
import Link from 'next/link';

interface ProjectCardProps {
  title: string;
  description: string;
  tech: string[];
  image: string;
  slug: string;
}

export default function ProjectCard({ title, description, tech, image, slug }: ProjectCardProps) {
  return (
    <Link href={`/projects/${slug}`}>
      <div className="group bg-gray-800 rounded-xl overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer">
        <div className="h-48 bg-gray-700 overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
        <div className="p-5">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-gray-400 text-sm">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tech.map((t) => (
              <span key={t} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
