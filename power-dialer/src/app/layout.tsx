import type { Metadata } from 'next';
import { Rajdhani, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const rajdhani = Rajdhani({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
});

const jetbrainsMono = JetBrains_Mono({
  subsets:  ['latin'],
  weight:   ['400', '500', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title:       'AgenticLife Power Dialer',
  description: 'Multi-agent power dialer with Sun-Chaser queue, AI battle cards, and SignalWire softphone.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg text-white antialiased min-h-screen">{children}</body>
    </html>
  );
}
