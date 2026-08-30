import { useMemo } from 'react';
import { Cloud } from 'lucide-react';
import type { Noticia } from '@/types';
import { contarPalavras } from '@/lib/data';

interface WordCloudProps {
  noticias: Noticia[];
  /** Chamado ao clicar em um termo — alimenta a busca livre. */
  onSelecionarTermo?: (termo: string) => void;
}

const TAMANHO_MIN = 12;
const TAMANHO_MAX = 46;

export default function WordCloud({ noticias, onSelecionarTermo }: WordCloudProps) {
  const palavras = useMemo(
    () => contarPalavras(noticias.map((n) => n.conteudo), 100),
    [noticias],
  );

  const { minimo, maximo } = useMemo(() => {
    if (palavras.length === 0) return { minimo: 0, maximo: 1 };
    const valores = palavras.map(([, contagem]) => contagem);
    return { minimo: Math.min(...valores), maximo: Math.max(...valores) };
  }, [palavras]);

  // Embaralha de forma DETERMINÍSTICA para o layout não dançar a cada render,
  // mas sem deixar os termos mais frequentes todos alinhados no início.
  const dispostas = useMemo(() => {
    return palavras
      .map((entrada, indice) => ({ entrada, ordem: ((indice * 37) % palavras.length) / palavras.length }))
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => item.entrada);
  }, [palavras]);

  if (palavras.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <h3 className="card-titulo">
        <Cloud size={16} className="text-brand-600" />
        Nuvem de Palavras
        <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-slate-400">
          Top {palavras.length} termos · clique para filtrar
        </span>
      </h3>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 p-6">
        {dispostas.map(([palavra, contagem]) => {
          const relativo = (contagem - minimo) / (maximo - minimo || 1);
          const tamanho = TAMANHO_MIN + relativo * (TAMANHO_MAX - TAMANHO_MIN);
          // Termos mais frequentes ficam mais escuros e mais pesados
          const luminosidade = 62 - relativo * 40;

          return (
            <button
              key={palavra}
              type="button"
              onClick={() => onSelecionarTermo?.(palavra)}
              title={`${palavra} — ${contagem} ocorrências`}
              className="inline-block leading-tight transition duration-150 hover:scale-110 hover:text-brand-600"
              style={{
                fontSize: `${tamanho}px`,
                fontWeight: 400 + Math.round(relativo * 3) * 100,
                color: `hsl(205, ${30 + relativo * 35}%, ${luminosidade}%)`,
              }}
            >
              {palavra}
            </button>
          );
        })}
      </div>
    </section>
  );
}
