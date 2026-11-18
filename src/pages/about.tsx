import React from 'react';
import Head from 'next/head';

export default function About() {
  return (
    <>
      <Head>
        <title>About – My Portfolio</title>
        <meta name="description" content="About me" />
      </Head>
      <section className="prose prose-lg mx-auto text-white">
        <h1>About Me</h1>
        <p>
          I am a creative engineer with a passion for building interactive web experiences.
          My work blends design, animation, and modern web technologies to craft memorable
          digital products.
        </p>
        <p>
          When I’m not coding, you can find me exploring 3‑D art, hiking, or experimenting
          with generative music.
        </p>
      </section>
    </>
  );
}
