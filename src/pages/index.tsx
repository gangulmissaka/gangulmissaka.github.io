import React from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { SITE } from '@/data/portfolioData';

// WebGL only runs in the browser.
const CyberWorld = dynamic(() => import('@/components/CyberWorld'), {
  ssr: false,
  loading: () => <div style={{ position: 'fixed', inset: 0, background: '#0b0b0a' }} />,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>{`${SITE.ownerName} — ${SITE.role}`}</title>
        <meta name="description" content={`${SITE.ownerName}'s interactive 3D portfolio: ride a motorbike through a valley where every house holds a project.`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0b0b0a" />
      </Head>
      <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0b0b0a' }}>
        <CyberWorld />
      </main>
    </>
  );
}
