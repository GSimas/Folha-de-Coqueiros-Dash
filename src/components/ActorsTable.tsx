import { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { AtorComSNA } from '@/types';
import { COR_POR_TIPO } from '@/lib/constantes';
import { Revelar } from '@/lib/motion';
import TabelaDados from './TabelaDados';

interface ActorsTableProps {
  atores: AtorComSNA[];
}

const coluna = createColumnHelper<AtorComSNA>();

/** Célula numérica com barra de proporção — facilita comparar centralidades. */
function CelulaMetrica({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const proporcao = maximo > 0 ? (valor / maximo) * 100 : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-px w-14 bg-line sm:block">
        <div
          className="h-px transition-all duration-700 ease-suave"
          style={{ width: `${proporcao}%`, backgroundColor: cor }}
        />
      </div>
      <span className="w-14 text-right font-mono text-xs tabular-nums text-ink">{valor.toLocaleString('pt-BR')}</span>
    </div>
  );
}

export default function ActorsTable({ atores }: ActorsTableProps) {
  // Máximos usados para normalizar as barras de proporção
  const maximos = useMemo(
    () => ({
      citacoes: Math.max(1, ...atores.map((a) => a.citacoes)),
      grau: Math.max(1, ...atores.map((a) => a.grauAbsoluto)),
      betweenness: Math.max(0.0001, ...atores.map((a) => a.betweenness)),
      closeness: Math.max(0.0001, ...atores.map((a) => a.closeness)),
    }),
    [atores],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Ator',
        meta: { tipo: 'texto' },
        cell: (info) => {
          const ator = info.row.original;
          return (
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COR_POR_TIPO[ator.tipo] }}
              />
              <div className="min-w-0">
                <p className="font-medium text-ink">{ator.nome}</p>
                <p className="line-clamp-2 text-xs text-muted">{ator.descricao}</p>
              </div>
            </div>
          );
        },
      }),
      coluna.accessor('tipo', {
        header: 'Tipo',
        meta: { tipo: 'categoria' },
        cell: (info) => {
          const tipo = info.getValue();
          return (
            <span
              className="chip"
              style={{ backgroundColor: `${COR_POR_TIPO[tipo]}1f`, color: COR_POR_TIPO[tipo] }}
            >
              {tipo}
            </span>
          );
        },
      }),
      coluna.accessor('citacoes', {
        header: 'Citações',
        meta: { tipo: 'numero', alinhar: 'direita' },
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.citacoes} cor="rgb(var(--faint))" />
        ),
      }),
      coluna.accessor('grauAbsoluto', {
        header: 'Grau',
        meta: { tipo: 'numero', alinhar: 'direita' },
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.grau} cor="rgb(var(--signal))" />
        ),
      }),
      coluna.accessor('betweenness', {
        header: 'Betweenness',
        meta: { tipo: 'numero', alinhar: 'direita' },
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.betweenness} cor="#b48ad8" />
        ),
      }),
      coluna.accessor('closeness', {
        header: 'Closeness',
        meta: { tipo: 'numero', alinhar: 'direita' },
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.closeness} cor="#57b7a0" />
        ),
      }),
    ],
    [maximos],
  );

  return (
    <Revelar como="section" className="card overflow-hidden">
      <TabelaDados
        dados={atores}
        colunas={colunas}
        rotuloItens="atores"
        ordenacaoInicial={[{ id: 'grauAbsoluto', desc: true }]}
        porPagina={15}
        larguraMinima="min-w-[820px]"
        buscaGlobal={{
          placeholder: 'Buscar por nome ou descrição…',
          texto: (ator) => `${ator.nome} ${ator.descricao}`,
        }}
        titulo={
          <h3 className="rotulo">
            <span className="text-signal">A</span> · Atores e métricas de rede (SNA)
          </h3>
        }
      />
    </Revelar>
  );
}
