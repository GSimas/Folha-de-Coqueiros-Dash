import {
  MessageSquare,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { GithubIcon, InstagramIcon, LinkedinIcon } from './SocialIcons';

interface NavbarProps {
  onAbrirChat: () => void;
  /** Abre/fecha a gaveta de filtros no mobile. */
  onAlternarFiltros: () => void;
  /** Recolhe/expande a barra lateral no desktop. */
  onAlternarRecolhida: () => void;
  sidebarRecolhida: boolean;
}

const SECOES = [
  { id: 'visao-geral', rotulo: 'Visão Geral' },
  { id: 'rede', rotulo: 'Rede de Atores' },
  { id: 'causal', rotulo: 'Mapa Causal' },
  { id: 'atores', rotulo: 'Banco de Atores' },
  { id: 'acervo', rotulo: 'Acervo' },
];

const REDES = [
  {
    href: 'https://folhadecoqueiros.com.br',
    rotulo: 'Site da Folha de Coqueiros',
    Icone: Newspaper,
  },
  { href: 'https://github.com/GSimas', rotulo: 'GitHub', Icone: GithubIcon },
  { href: 'https://www.linkedin.com/in/simasgs/', rotulo: 'LinkedIn', Icone: LinkedinIcon },
  { href: 'https://instagram.com/tudoemsimas', rotulo: 'Instagram', Icone: InstagramIcon },
];

export default function Navbar({
  onAbrirChat,
  onAlternarFiltros,
  onAlternarRecolhida,
  sidebarRecolhida,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        {/* Mobile: abre a gaveta de filtros */}
        <button
          type="button"
          onClick={onAlternarFiltros}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir filtros"
        >
          <Menu size={20} />
        </button>

        {/* Desktop: recolhe/expande a barra lateral */}
        <button
          type="button"
          onClick={onAlternarRecolhida}
          className="hidden rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-brand-700 lg:inline-flex"
          aria-label={sidebarRecolhida ? 'Expandir painel de filtros' : 'Recolher painel de filtros'}
          aria-expanded={!sidebarRecolhida}
          title={sidebarRecolhida ? 'Expandir filtros' : 'Recolher filtros'}
        >
          {sidebarRecolhida ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>

        <a href="#visao-geral" className="flex shrink-0 items-center gap-3">
          {/* A arte é 200x50 (4:1): `object-contain` + largura automática
              preservam a marca inteira, em vez de recortá-la num quadrado. */}
          <img
            src="/folhadecoqueiros-logo.jpg"
            alt="Folha de Coqueiros"
            width={200}
            height={50}
            className="h-8 w-auto shrink-0 object-contain"
          />
          <span className="hidden leading-tight lg:block">
            <span className="block text-sm font-bold text-slate-900">Folha de Coqueiros</span>
            <span className="block text-xs text-slate-500">Dashboard Analítico e IA</span>
          </span>
        </a>

        <nav className="ml-4 hidden items-center gap-1 xl:flex">
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand-700"
            >
              {secao.rotulo}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-2 hidden items-center gap-1 md:flex">
            {REDES.map(({ href, rotulo, Icone }) => (
              <a
                key={rotulo}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={rotulo}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-700"
              >
                <Icone size={18} />
              </a>
            ))}
          </div>

          <button type="button" onClick={onAbrirChat} className="botao-primario">
            <MessageSquare size={16} />
            <span className="hidden sm:inline">Assistente IA</span>
          </button>
        </div>
      </div>
    </header>
  );
}
