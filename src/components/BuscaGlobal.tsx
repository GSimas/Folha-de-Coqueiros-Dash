import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CalendarDays, FileText, Folder, Hash, Search, User, X } from 'lucide-react';
import type { Ator, Noticia } from '@/types';
import { COR_POR_TIPO } from '@/lib/constantes';
import { buscarNoAcervo, criarIndiceBusca, palavrasDaConsulta, realcar } from '@/lib/busca';
import { useFocoPreso, usePresenca } from '@/lib/motion';
import { usePerfis } from '@/lib/perfis';

interface BuscaGlobalProps {
  noticias: Noticia[];
  atores: Ator[];
}

interface Item {
  id: string;
  grupo: string;
  executar: () => void;
  conteudo: ReactNode;
}

const ehMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function Realce({ texto, palavras }: { texto: string; palavras: string[] }) {
  return (
    <>
      {realcar(texto, palavras).map((parte, i) =>
        parte.marcado ? (
          <mark key={i} className="bg-signal/20 text-ink">
            {parte.texto}
          </mark>
        ) : (
          parte.texto
        ),
      )}
    </>
  );
}

export default function BuscaGlobal({ noticias, atores }: BuscaGlobalProps) {
  const { abrirAtor, abrirTema, abrirCategoria, pesquisar } = usePerfis();
  const [aberta, setAberta] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [ativo, setAtivo] = useState(0);
  const { montado, visivel } = usePresenca(aberta, 220);
  const listaRef = useRef<HTMLDivElement>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  useFocoPreso(dialogoRef, aberta);
  const idLista = useId();

  // Índice criado só na primeira abertura: o acervo inteiro normalizado custa alguns ms.
  const indice = useMemo(() => (montado ? criarIndiceBusca(noticias, atores) : null), [montado, noticias, atores]);
  const consultaAdiada = useDeferredValue(consulta);
  const resultado = useMemo(() => (indice ? buscarNoAcervo(indice, consultaAdiada) : null), [indice, consultaAdiada]);
  const palavras = palavrasDaConsulta(consultaAdiada);

  const fechar = () => setAberta(false);
  const executarEFechar = (acao: () => void) => () => {
    acao();
    fechar();
  };

  // Atalhos globais: ⌘K / Ctrl+K e "/" fora de campos de texto.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement;
      const digitando = alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
      if ((evento.key === 'k' && (evento.metaKey || evento.ctrlKey)) || (evento.key === '/' && !digitando)) {
        evento.preventDefault();
        setAberta(true);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => setAtivo(0), [consultaAdiada]);

  const termo = consultaAdiada.trim();
  const itens: Item[] = [];
  if (resultado) {
    for (const ator of resultado.atores) {
      itens.push({
        id: `a${ator.id}`,
        grupo: 'Atores',
        executar: executarEFechar(() => abrirAtor(ator.id)),
        conteudo: (
          <>
            <User size={15} className="mt-0.5 shrink-0" style={{ color: COR_POR_TIPO[ator.tipo] }} />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink">
                <Realce texto={ator.nome} palavras={palavras} />
              </span>
              <span className="ml-2 text-xs text-muted">
                {ator.tipo} · {ator.noticias.length} {ator.noticias.length === 1 ? 'notícia' : 'notícias'}
              </span>
            </span>
          </>
        ),
      });
    }
    for (const { termo: palavra, total } of resultado.termos) {
      itens.push({
        id: `t${palavra}`,
        grupo: 'Palavras-chave',
        executar: executarEFechar(() => abrirTema(palavra)),
        conteudo: (
          <>
            <Hash size={15} className="mt-0.5 shrink-0 text-faint" />
            <span className="flex-1 text-ink">
              <Realce texto={palavra} palavras={palavras} />
            </span>
            <span className="font-mono text-xs tabular-nums text-faint">{total}</span>
          </>
        ),
      });
    }
    for (const { noticia, trecho } of resultado.noticias) {
      itens.push({
        id: `n${noticia.id}`,
        grupo: 'Notícias',
        executar: () => window.open(noticia.url, '_blank', 'noopener,noreferrer'),
        conteudo: (
          <>
            <FileText size={15} className="mt-0.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-1 font-medium text-ink">
                <span className="line-clamp-1">
                  <Realce texto={noticia.titulo} palavras={palavras} />
                </span>
                <ArrowUpRight size={12} className="mt-1 shrink-0 text-faint" />
              </span>
              <span className="mt-0.5 line-clamp-1 text-xs text-muted">
                <Realce texto={trecho} palavras={palavras} />
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                <span>{noticia.data || 'sem data'}</span>
                {noticia.categorizada && <span>· {noticia.categorias}</span>}
                {noticia.ehEvento && (
                  <span className="inline-flex items-center gap-1 text-signal">
                    · <CalendarDays size={10} /> evento
                  </span>
                )}
              </span>
            </span>
          </>
        ),
      });
    }
    for (const { nome, total } of resultado.categorias) {
      itens.push({
        id: `c${nome}`,
        grupo: 'Categorias',
        executar: executarEFechar(() => abrirCategoria(nome)),
        conteudo: (
          <>
            <Folder size={15} className="mt-0.5 shrink-0 text-faint" />
            <span className="flex-1 text-ink">
              <Realce texto={nome} palavras={palavras} />
            </span>
            <span className="font-mono text-xs tabular-nums text-faint">{total}</span>
          </>
        ),
      });
    }
    if (resultado.totalNoticias > 0) {
      itens.push({
        id: 'todas',
        grupo: '',
        executar: executarEFechar(() => pesquisar(termo)),
        conteudo: (
          <span className="flex-1 text-sm text-signal">
            {resultado.totalNoticias === 1
              ? `Ver a notícia com “${termo}” no acervo →`
              : `Ver as ${resultado.totalNoticias.toLocaleString('pt-BR')} notícias com “${termo}” no acervo →`}
          </span>
        ),
      });
    }
  }

  const indiceAtivo = Math.min(ativo, Math.max(0, itens.length - 1));

  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [indiceAtivo]);

  const aoTeclarNoCampo = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') fechar();
    else if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (itens.length === 0) return;
      const passo = evento.key === 'ArrowDown' ? 1 : -1;
      setAtivo((indiceAtivo + passo + itens.length) % itens.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      if (itens[indiceAtivo]) itens[indiceAtivo].executar();
      else if (termo) executarEFechar(() => pesquisar(termo))();
    }
  };

  return (
    <>
      {/* Gatilho no cabeçalho: parece um campo; em telas pequenas vira ícone. */}
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-keyshortcuts={ehMac ? 'Meta+K' : 'Control+K'}
        className="campo hidden w-56 items-center gap-2 text-left text-faint hover:border-signal/40 md:flex 2xl:w-72"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 truncate">Pesquisar no acervo…</span>
        <kbd aria-hidden className="rounded-sm border border-line px-1.5 font-mono text-[0.625rem] text-faint">
          {ehMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Pesquisar no acervo"
        className="botao-icone md:hidden"
      >
        <Search size={18} />
      </button>

      {/* Portal: o `backdrop-blur` do cabeçalho prenderia o `fixed` à faixa do cabeçalho. */}
      {montado &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
            <div
              className={`absolute inset-0 bg-canvas/60 backdrop-blur-sm transition-opacity duration-200 ${
                visivel ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={fechar}
              aria-hidden
            />
            <div
              ref={dialogoRef}
              role="dialog"
              aria-modal="true"
              aria-label="Pesquisar no acervo"
              className={`relative flex max-h-[75vh] w-full max-w-2xl flex-col border border-line bg-elevated shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)]
                        transition duration-200 ease-suave
                        ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.98] opacity-0'}`}
            >
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search size={16} className="shrink-0 text-signal" />
                <input
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  value={consulta}
                  onChange={(e) => setConsulta(e.target.value)}
                  onKeyDown={aoTeclarNoCampo}
                  placeholder="Notícias, atores, palavras-chave, categorias…"
                  role="combobox"
                  aria-expanded={itens.length > 0}
                  aria-controls={idLista}
                  aria-activedescendant={itens[indiceAtivo] ? `${idLista}-${itens[indiceAtivo].id}` : undefined}
                  aria-autocomplete="list"
                  maxLength={200}
                  className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
                />
                <button type="button" onClick={fechar} className="botao-icone" aria-label="Fechar pesquisa">
                  <X size={16} />
                </button>
              </div>

              <div ref={listaRef} id={idLista} role="listbox" aria-label="Resultados" className="overflow-y-auto p-2">
                {!resultado ? (
                  <p className="px-3 py-6 text-center text-sm text-muted">
                    Pesquise em todas as {noticias.length.toLocaleString('pt-BR')} notícias e{' '}
                    {atores.length.toLocaleString('pt-BR')} atores do acervo.
                  </p>
                ) : itens.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted">
                    Nada encontrado para <span className="titulo-serif">“{termo}”.</span>
                  </p>
                ) : (
                  itens.map((item, i) => (
                    <div key={item.id}>
                      {item.grupo && item.grupo !== itens[i - 1]?.grupo && (
                        <p className="rotulo px-3 pb-1 pt-3">{item.grupo}</p>
                      )}
                      {!item.grupo && <div className="my-2 border-t border-line" />}
                      <div
                        id={`${idLista}-${item.id}`}
                        role="option"
                        aria-selected={i === indiceAtivo}
                        data-brilho
                        onMouseMove={() => i !== indiceAtivo && setAtivo(i)}
                        onClick={item.executar}
                        className={`flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2 text-sm transition ${
                          i === indiceAtivo ? 'bg-signal/10' : ''
                        }`}
                      >
                        {item.conteudo}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-line px-4 py-2 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
                <span>↑↓ navegar</span>
                <span>↵ abrir</span>
                <span>esc fechar</span>
                <span className="ml-auto hidden sm:inline">notícias abrem no site da Folha</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
