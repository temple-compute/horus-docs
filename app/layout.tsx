import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import type { Metadata } from 'next';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.templecompute.com'),
  title: {
    default: 'Horus',
    template: '%s | Horus',
  },
  description: 'Next generation workflow manager',
  icons: { icon: '/img/horus.png' },
  openGraph: {
    title: 'Horus',
    description: 'Next generation workflow manager',
    images: '/img/horus.png',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
