import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://patricrc.github.io/haber/'),
  title: 'Haber — Finanzas personales',
  description: 'Tu dinero en soles y dólares, claro y sin mezclar.',
  openGraph: {
    title: 'Haber',
    description: 'Tus soles y dólares, en orden.',
    images: [{ url: 'https://patricrc.github.io/haber/og.png', width: 1200, height: 630, alt: 'Haber — Tus soles y dólares, en orden.' }],
    locale: 'es_PE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Haber',
    description: 'Tus soles y dólares, en orden.',
    images: ['https://patricrc.github.io/haber/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE">
      <body
        className={`${plexSans.variable} ${plexMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
