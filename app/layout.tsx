import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: 'Rubric Checker',
  description: 'Double-check rubric scoring and grammar in one view.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-base">{children}</body>
    </html>
  );
}
