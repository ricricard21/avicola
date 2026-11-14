import type { Metadata, Viewport } from 'next';
import { ProveedorAvisos } from '@/components/ui';
import { SCRIPT_TEMA } from '@/lib/tema';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Avícola San Ángel', template: '%s · Avícola San Ángel' },
  description: 'Sistema de gestión: ventas, Pollitandas, inventario y cobranza.',
  icons: { icon: '/icono.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4eee2' },
    { media: '(prefers-color-scheme: dark)', color: '#14100b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </body>
    </html>
  );
}
