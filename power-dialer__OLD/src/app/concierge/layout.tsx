import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'AgenticLife Concierge — Find Your Perfect Restaurant',
  description: 'Tell us what you\'re in the mood for and we\'ll find the perfect spot nearby.',
  themeColor: '#060810',
};

export default function ConciergeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
