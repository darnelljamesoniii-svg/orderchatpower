import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Lock Your Zone — AgenticLife',
  description: 'See how many customers your competitors are stealing — and lock your area before they do.',
  themeColor: '#060810',
};

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
