import React from 'react';
import Head from 'next/head';
import ProjectCard from '@/components/ProjectCard';

const projects = [
  {
    title: 'Interactive 3D Dashboard',
    description: 'A real-time data visualization dashboard built with Three.js and WebSockets.',
    tech: ['Three.js', 'React', 'Node.js', 'WebSocket'],
    image: 'https://picsum.photos/seed/project1/600/400',
    slug: 'interactive-3d-dashboard',
  },
  {
    title: 'E-Commerce Platform',
    description: 'A full-stack e-commerce app with payments, auth, and admin panel.',
    tech: ['Next.js', 'Stripe', 'PostgreSQL', 'Tailwind'],
    image: 'https://picsum.photos/seed/project2/600/400',
    slug: 'ecommerce-platform',
  },
  {
    title: 'AI Chat Assistant',
    description: 'A conversational AI assistant powered by large language models.',
    tech: ['Python', 'FastAPI', 'React', 'OpenAI'],
    image: 'https://picsum.photos/seed/project3/600/400',
    slug: 'ai-chat-assistant',
  },
];

export default function Projects() {
  return (
    <>
      <Head>
        <title>Projects – My Portfolio</title>
        <meta name="description" content="My projects" />
      </Head>
      <section className="py-12">
        <h1 className="text-4xl font-bold text-center mb-10">Projects</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((p) => (
            <ProjectCard key={p.slug} {...p} />
          ))}
        </div>
      </section>
    </>
  );
}
