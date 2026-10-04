import { useMemo, useRef } from 'react';
import type { Noticia } from '@/types';
import { contarPalavras } from '@/lib/data';
import { Revelar } from '@/lib/motion';
import { usePerfis } from '@/lib/perfis';
import { BaixarGrafico } from './MenuBaixar';

interface WordCloudProps {
  noticias: Noticia[];
}

// Em rem, para acompanhar a preferência de tamanho de fonte.
const TAMANHO_MIN = 0.75;
const TAMANHO_MAX = 3;

export default function WordCloud({ noticias }: WordCloudProps) {
  const { abrirTema } = usePerfis();
  const nuvemRef = useRef<HTMLDivElement>(null);
  const palavras = useMemo(
    () =>
      contarPalavras(
        noticias.map((n) => n.conteudo),
        100,
      ),
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
    return <p className="card vazio">Sem termos suficientes no recorte.</p>;
  }

  const destaques = palavras.slice(0, 5);

  return (
    <>
      <Revelar className="card">
        <h2 className="card-titulo">
          <span className="text-signal">A</span> · Nuvem de termos
          <span className="ml-auto normal-case tracking-normal text-faint">
            top {palavras.length} · clique para ver o perfil
          </span>
          <span className="-my-2">
            <BaixarGrafico alvo={nuvemRef} nome="nuvem-de-termos" titulo="O que o bairro comenta — nuvem de termos" />
          </span>
        </h2>

        <div
          ref={nuvemRef}
          data-exportar-texto
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-6 py-10"
        >
          {dispostas.map(([palavra, contagem], i) => {
            const relativo = (contagem - minimo) / (maximo - minimo || 1);
            const tamanho = TAMANHO_MIN + relativo * (TAMANHO_MAX - TAMANHO_MIN);

            return (
              <button
                key={palavra}
                type="button"
                data-palavra
                onClick={() => abrirTema(palavra)}
                title={`${palavra} — ${contagem} ocorrências · abrir perfil`}
                className="inline-block animate-fade-in rounded-sm px-1 leading-tight tracking-tight transition duration-300 hover:!text-signal hover:[text-shadow:0_0_24px_rgb(var(--signal)/0.6)]"
                style={{
                  fontSize: `${tamanho}rem`,
                  fontWeight: 400 + Math.round(relativo * 3) * 100,
                  // Do tom secundário ao azul de sinal conforme a frequência.
                  color: `color-mix(in oklab, rgb(var(--signal)) ${Math.round(25 + relativo * 75)}%, rgb(var(--muted)))`,
                  animationDelay: `${i * 6}ms`,
                }}
              >
                {palavra}
              </button>
            );
          })}
        </div>
      </Revelar>

      {/* Os cinco termos dominantes, em leitura direta */}
      <Revelar atraso={120}>
        <ol className="grid gap-px border border-line bg-line sm:grid-cols-5">
          {destaques.map(([palavra, contagem], i) => (
            <li key={palavra} className="bg-surface">
              <button
                type="button"
                onClick={() => abrirTema(palavra)}
                className="group flex h-full w-full flex-col p-5 text-left"
              >
                <span className="rotulo">
                  <span className="text-signal">{String(i + 1).padStart(2, '0')}</span> · termo
                </span>
                <span className="mt-3 truncate text-xl font-semibold tracking-tight text-ink transition group-hover:text-signal">
                  {palavra}
                </span>
                <span className="mt-1 font-mono text-xs text-faint">
                  {contagem.toLocaleString('pt-BR')} ocorrências
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Revelar>
    </>
  );
}
