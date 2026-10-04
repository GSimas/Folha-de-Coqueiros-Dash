import { useCallback, useRef, useState } from 'react';
import { Menu, Sparkles, X } from 'lucide-react';
import SettingsMenu from './SettingsMenu';
import { MODULOS, hrefDe, type Rota } from '@/lib/rotas';
import { useDispensar, usePresenca } from '@/lib/motion';

interface NavbarProps {
  rota: Rota;
  onAbrirChat: () => void;
}

export default function Navbar({ rota, onAbrirChat }: NavbarProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const { montado, visivel } = usePresenca(menuAberto, 260);
  const menuRef = useRef<HTMLDivElement>(null);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);
  useDispensar(menuRef, menuAberto, fecharMenu);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <a href={hrefDe('inicio')} className="group flex shrink-0 items-center gap-3 rounded-sm">
          {/* A arte tem fundo branco: vai num selo claro, como um cabeçalho de jornal. */}
          <span className="flex h-9 items-center border border-line bg-[#fbfbf8] px-2 transition group-hover:border-signal/50">
            <img
              src="/folhadecoqueiros-logo.jpg"
              alt="Folha de Coqueiros"
              width={200}
              height={50}
              className="h-6 w-auto object-contain"
            />
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
              Dados · Território · IA
            </span>
            <span className="block text-sm font-semibold text-ink">
              Dashboard <span className="font-serif text-base font-normal italic text-signal">analítico</span>
            </span>
          </span>
        </a>

        <nav className="ml-6 hidden items-center xl:flex" aria-label="Módulos">
          {MODULOS.map((modulo) => {
            const ativo = rota === modulo.rota;
            return (
              <a
                key={modulo.rota}
                href={hrefDe(modulo.rota)}
                aria-current={ativo ? 'page' : undefined}
                className={`relative rounded-sm px-3 py-2 text-[0.8125rem] font-medium transition ${
                  ativo ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {modulo.rotulo}
                <span
                  className={`absolute inset-x-3 -bottom-[13px] h-px bg-signal shadow-[0_0_12px_rgb(var(--signal))] transition-all duration-500 ease-suave ${
                    ativo ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                  }`}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <SettingsMenu />

          <button type="button" onClick={onAbrirChat} className="botao-primario ml-1 px-3 sm:px-4">
            <Sparkles size={15} />
            <span className="hidden sm:inline">Assistente</span>
          </button>

          {/* Menu de módulos em telas menores */}
          <div ref={menuRef} className="relative xl:hidden">
            <button
              type="button"
              onClick={() => setMenuAberto((v) => !v)}
              className="botao-icone"
              aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu de módulos'}
              aria-expanded={menuAberto}
            >
              {menuAberto ? <X size={20} /> : <Menu size={20} />}
            </button>

            {montado && (
              <nav
                aria-label="Módulos"
                className={`absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 origin-top-right border border-line bg-elevated/95 p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)] backdrop-blur-xl
                            transition duration-200 ease-suave
                            ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.97] opacity-0'}`}
              >
                <a
                  href={hrefDe('inicio')}
                  onClick={fecharMenu}
                  className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-muted transition hover:text-ink"
                >
                  <span className="font-mono text-[0.6875rem] text-faint">00</span> Início
                </a>
                {MODULOS.map((modulo, i) => (
                  <a
                    key={modulo.rota}
                    href={hrefDe(modulo.rota)}
                    onClick={fecharMenu}
                    aria-current={rota === modulo.rota ? 'page' : undefined}
                    style={{ transitionDelay: visivel ? `${40 + i * 25}ms` : '0ms' }}
                    className={`flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition duration-300 ${
                      visivel ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'
                    } ${rota === modulo.rota ? 'bg-signal/10 text-signal' : 'text-muted hover:text-ink'}`}
                  >
                    <span className="font-mono text-[0.6875rem] text-faint">{modulo.indice}</span>
                    <modulo.Icone size={15} />
                    {modulo.rotulo}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
