import { MessageSquare, Menu } from 'lucide-react';
import { GithubIcon, InstagramIcon, LinkedinIcon } from './SocialIcons';

interface NavbarProps {
  onAbrirChat: () => void;
  onAlternarFiltros: () => void;
}

const SECOES = [
  { id: 'visao-geral', rotulo: 'Visão Geral' },
  { id: 'rede', rotulo: 'Rede de Atores' },
  { id: 'causal', rotulo: 'Mapa Causal' },
  { id: 'atores', rotulo: 'Banco de Atores' },
  { id: 'acervo', rotulo: 'Acervo' },
];

const REDES = [
  { href: 'https://github.com/GSimas', rotulo: 'GitHub', Icone: GithubIcon },
  { href: 'https://www.linkedin.com/in/simasgs/', rotulo: 'LinkedIn', Icone: LinkedinIcon },
  { href: 'https://instagram.com/tudoemsimas', rotulo: 'Instagram', Icone: InstagramIcon },
];

export default function Navbar({ onAbrirChat, onAlternarFiltros }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={onAlternarFiltros}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir filtros"
        >
          <Menu size={20} />
        </button>

        <a href="#visao-geral" className="flex shrink-0 items-center gap-3">
          <img
            src="/folhadecoqueiros-logo.jpg"
            alt="Folha de Coqueiros"
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200"
          />
          <span className="hidden leading-tight sm:block">
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
