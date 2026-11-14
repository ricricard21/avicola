'use client';

import { Shell } from '@/components/shell';
import { ProveedorSesion } from '@/lib/sesion';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorSesion>
      <Shell>{children}</Shell>
    </ProveedorSesion>
  );
}
