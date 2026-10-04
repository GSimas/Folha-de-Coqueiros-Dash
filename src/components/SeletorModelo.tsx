import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import type { ModeloIA } from '@/lib/ia/provedores';
import { useDispensar, usePresenca } from '@/lib/motion';

interface SeletorModeloProps {
  modelos: ModeloIA[];
  valor: string;
  onMudar: (id: string) => void;
  carregando: boolean;
  /** Exibe o filtro "só gratuitos" (OpenRouter). */
  temGratuitos?: boolean;
}

const LIMITE_EXIBIDOS = 250;

const formatarContexto = (tokens?: number) =>
  !tokens ? null : tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M` : `${Math.round(tokens / 1000)}k`;

/** Combobox com busca para escolher entre centenas de modelos. */
export default function SeletorModelo({ modelos, valor, onMudar, carregando, temGratuitos }: SeletorModeloProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [soGratuitos, setSoGratuitos] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const { montado, visivel } = usePresenca(aberto, 200);
  const raizRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const fechar = useCallback(() => setAberto(false), []);
  useDispensar(raizRef, aberto, fechar);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return modelos
      .filter((m) => (!soGratuitos || m.gratuito) && (!termo || `${m.nome} ${m.id}`.toLowerCase().includes(termo)))
      .slice(0, LIMITE_EXIBIDOS);
  }, [modelos, busca, soGratuitos]);

  const atual = modelos.find((m) => m.id === valor);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setAtivo(Math.max(0, modelos.findIndex((m) => m.id === valor)));
    const timer = setTimeout(() => buscaRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [aberto, modelos, valor]);

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  const escolher = (id: string) => {
    onMudar(id);
    setAberto(false);
  };

  // Sem lista (provedor sem listagem ou falha): campo livre para o id do modelo.
  if (!carregando && modelos.length === 0) {
    return (
      <input
        className="campo font-mono text-xs"
        value={valor}
        onChange={(e) => onMudar(e.target.value.trim())}
        placeholder="id do modelo (ex.: nome-do-modelo)"
        aria-label="Identificador do modelo"
      />
    );
  }

  return (
    <div ref={raizRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={carregando}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        className="campo flex items-center gap-2 text-left"
      >
        {carregando ? (
          <>
            <Loader2 size={14} className="animate-spin text-faint" />
            <span className="text-faint">Carregando modelos…</span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{atual?.nome ?? (valor || 'Escolha um modelo')}</span>
              <span className="block truncate font-mono text-[0.625rem] text-faint">{valor}</span>
            </span>
            {atual?.gratuito && <span className="chip bg-signal/15 text-signal">grátis</span>}
            <ChevronDown size={15} className={`shrink-0 text-faint transition-transform duration-300 ${aberto ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* No fluxo, não absoluto: o painel que contém o seletor é um acordeão com overflow oculto. */}
      {montado && (
        <div
          className={`mt-1.5 origin-top border border-line bg-elevated shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]
                      transition duration-200 ease-suave ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.98] opacity-0'}`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={14} className="shrink-0 text-faint" />
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setAtivo((i) => Math.min(filtrados.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setAtivo((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter' && filtrados[ativo]) {
                  e.preventDefault();
                  escolher(filtrados[ativo].id);
                }
              }}
              placeholder={`Buscar entre ${modelos.length} modelos…`}
              className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none"
              role="combobox"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={filtrados[ativo] ? `${idLista}-${ativo}` : undefined}
            />
          </div>

          {temGratuitos && (
            <label className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={soGratuitos}
                onChange={(e) => {
                  setSoGratuitos(e.target.checked);
                  setAtivo(0);
                }}
                className="accent-[rgb(var(--signal))]"
              />
              Somente modelos gratuitos ({modelos.filter((m) => m.gratuito).length})
            </label>
          )}

          <ul ref={listaRef} id={idLista} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtrados.map((m, i) => {
              const selecionado = m.id === valor;
              return (
                <li
                  key={m.id}
                  id={`${idLista}-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={selecionado}
                  data-brilho=""
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(m.id)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition ${i === ativo ? 'bg-signal/10' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[0.8125rem] ${selecionado ? 'font-semibold text-signal' : 'text-ink'}`}>
                      {m.nome}
                    </span>
                    <span className="block truncate font-mono text-[0.625rem] text-faint">{m.id}</span>
                  </span>
                  {m.gratuito && <span className="chip shrink-0 bg-signal/15 text-signal">grátis</span>}
                  {formatarContexto(m.contexto) && (
                    <span className="shrink-0 font-mono text-[0.625rem] text-faint">{formatarContexto(m.contexto)}</span>
                  )}
                  {selecionado && <Check size={14} className="shrink-0 text-signal" />}
                </li>
              );
            })}
            {filtrados.length === 0 && <li className="px-3 py-6 text-center text-xs text-faint">Nenhum modelo encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
