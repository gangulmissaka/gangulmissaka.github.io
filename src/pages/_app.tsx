import '@/styles/globals.css';
import '@/styles/world.css';
import '@/styles/radio.css';
import type { AppProps } from 'next/app';

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
