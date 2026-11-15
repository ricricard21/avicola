'use client';

import { ArrowRight, Egg, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boton, Campo, Entrada } from '@/components/ui';
import { api, mensajeDe, sesionLocal } from '@/lib/api';
import { MODO_DEMO, USUARIOS_DEMO } from '@/lib/transporte';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (sesionLocal.leer()) router.replace('/');
  }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const { token } = await api<{ token: string }>('/auth/login', { cuerpo: { email: email.trim(), password } });
      sesionLocal.guardar(token);
      router.replace('/');
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-[#1b150d] p-12 text-[#f4ebdd] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-40 -right-40 size-[620px] rounded-full bg-[radial-gradient(closest-side,rgb(244_180_63/0.42),transparent)]" />
        <div aria-hidden className="absolute right-[-120px] bottom-[-220px] h-[640px] w-[480px] rotate-[18deg] rounded-[50%_50%_50%_50%/60%_60%_40%_40%] border border-[#f4b43f]/25" />
        <div aria-hidden className="absolute right-[-60px] bottom-[-160px] h-[520px] w-[390px] rotate-[18deg] rounded-[50%_50%_50%_50%/60%_60%_40%_40%] border border-[#f4b43f]/15" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#f4b43f] text-[#1b150d]">
            <Egg size={22} strokeWidth={1.6} />
          </span>
          <span className="leading-none">
            <span className="block text-[10px] font-semibold tracking-[0.24em] text-[#f4ebdd]/60 uppercase">Avícola</span>
            <span className="display mt-0.5 block text-xl font-semibold">San Ángel</span>
          </span>
        </div>

        <div className="entrada relative max-w-xl">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-[#f4b43f] uppercase">Sistema de gestión</p>
          <h1 className="mt-4 text-[clamp(2.6rem,4.6vw,4.4rem)] leading-[0.98] font-semibold">
            Toda la granja,
            <br />
            <em className="font-normal text-[#f4b43f]">en un solo lugar.</em>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#f4ebdd]/70">
            Ventas, Pollitandas, inventario y cobranza trabajando sobre la misma información. Un dato se captura una vez y aparece donde se necesita.
          </p>
        </div>

        <p className="relative text-xs text-[#f4ebdd]/45">Etapa 1 · Administración comercial</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={entrar} className="entrada w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-accent-ink shadow-glow">
              <Egg size={22} strokeWidth={1.6} />
            </span>
            <span className="display text-xl font-semibold">Avícola San Ángel</span>
          </div>

          <div>
            <h2 className="text-3xl font-semibold">Bienvenido</h2>
            <p className="mt-1.5 text-sm text-muted">Entra con tu correo y contraseña.</p>
          </div>

          <div className="mt-8 space-y-4">
            <Campo etiqueta="Correo">
              <Entrada type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@avicolasanangel.com" className="h-11" />
            </Campo>
            <Campo etiqueta="Contraseña">
              <div className="relative">
                <Entrada type={ver ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" />
                <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink">
                  {ver ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
                </button>
              </div>
            </Campo>
          </div>

          {error && (
            <p role="alert" className="tono tono-rojo mt-4 rounded-xl border px-3.5 py-2.5 text-sm">
              {error}
            </p>
          )}

          <Boton type="submit" variante="primario" tamano="lg" cargando={enviando} className="mt-6 w-full">
            Entrar <ArrowRight size={17} strokeWidth={1.75} />
          </Boton>

          {MODO_DEMO ? (
            <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Demostración · entra con un clic</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {USUARIOS_DEMO.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(u.clave);
                      setError('');
                    }}
                    className="rounded-xl border border-line px-3 py-2 text-left text-[13px] transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    {u.rol}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Elige un puesto y presiona Entrar. Cada uno ve solo sus módulos.</p>
            </div>
          ) : (
            <p className="mt-8 text-center text-xs text-muted">¿Olvidaste tu contraseña? Pide a Dirección que la restablezca.</p>
          )}
        </form>
      </div>
    </div>
  );
}
