import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Atlas — Workflow Consultant & Prompt Engineering Cockpit',
  description:
    'Atlas is the live consultant cockpit: scope intake, 12-model backtest gate, 30/90/180 review cadence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans text-[13px] leading-[1.5] text-ink antialiased">
        <div className="stars" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
