import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';

const font = Space_Grotesk({ subsets: ['latin'], variable: '--font-base' });

export const metadata: Metadata = {
  title: 'Rubric Checker',
  description: 'Double-check rubric scoring and grammar in one view.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
