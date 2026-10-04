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
    default: 'Temple Compute Docs',
    template: '%s | Temple Compute Docs',
  },
  description: 'Documentation for Horus and Temple Compute OS',
  icons: { icon: { url: '/tc-logo.svg', type: 'image/svg+xml' } },
  openGraph: {
    title: 'Temple Compute Docs',
    description: 'Documentation for Horus and Temple Compute OS',
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
