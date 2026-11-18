import React, { useState, FormEvent } from 'react';
import Head from 'next/head';

export default function Contact() {
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Replace with your Formspree endpoint or custom API
    setSent(true);
  };

  return (
    <>
      <Head>
        <title>Contact – My Portfolio</title>
        <meta name="description" content="Get in touch" />
      </Head>
      <section className="max-w-xl mx-auto py-16">
        <h1 className="text-4xl font-bold text-center mb-8">Get In Touch</h1>
        {sent ? (
          <p className="text-center text-green-400 text-lg">Thanks! I&apos;ll be in touch shortly.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              name="name"
              placeholder="Your name"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <textarea
              name="message"
              rows={5}
              placeholder="Your message"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
            >
              Send Message
            </button>
          </form>
        )}
      </section>
    </>
  );
}
