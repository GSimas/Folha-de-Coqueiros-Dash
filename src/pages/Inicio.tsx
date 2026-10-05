import { useMemo, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, Sparkles } from "lucide-react";
import type { Ator, Noticia } from "@/types";
import { MODULOS_VISIVEIS as MODULOS, hrefDe } from "@/lib/rotas";
import { Revelar, useContagem } from "@/lib/motion";

interface InicioProps {
  noticias: Noticia[];
  atores: Ator[];
  periodo: { inicio: string; fim: string };
  onAbrirChat: () => void;
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const mesAno = (iso: string) => {
  const [ano, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
};

function Numero({
  valor,
  rotulo,
  indice,
}: {
  valor: number;
  rotulo: string;
  indice: string;
}) {
  const exibido = useContagem(valor);
  return (
    <div className="bg-canvas px-5 py-6 sm:px-7 sm:py-8">
      <p className="rotulo">
        <span className="text-faint">{indice} ·</span> {rotulo}
      </p>
      <p className="mt-3 text-4xl font-semibold tabular-nums tracking-[-0.03em] text-ink sm:text-5xl">
        {exibido.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

export default function Inicio({
  noticias,
  atores,
  periodo,
  onAbrirChat,
}: InicioProps) {
  const numeros = useMemo(
    () => ({
      noticias: noticias.length,
      atores: atores.length,
      eventos: noticias.filter((n) => n.ehEvento).length,
      categorias: new Set(
        noticias.filter((n) => n.categorizada).map((n) => n.categorias),
      ).size,
    }),
    [noticias, atores],
  );

  return (
    <div className="overflow-x-clip">
      {/* --- Abertura --- */}
      <section className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1400px] flex-col justify-center px-4 py-16 sm:px-6">
        <div className="pointer-events-none absolute inset-x-4 top-6 flex justify-between font-mono text-[0.625rem] uppercase tracking-[0.18em] text-faint sm:inset-x-6">
          <span>FDC / 001</span>
          <span>27°36′ S — 48°34′ W</span>
        </div>

        {/* Órbitas decorativas, à moda Scientata */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-12rem] top-1/2 hidden h-[44rem] w-[44rem] -translate-y-1/2 rounded-full border border-line md:block"
        >
          <span className="absolute left-[18%] top-[12%] h-2 w-2 animate-pulsar rounded-full bg-signal shadow-[0_0_16px_rgb(var(--signal))]" />
          <div className="absolute inset-24 rounded-full border border-line/70" />
        </div>

        <div className="relative">
          <p className="rotulo flex animate-fade-in items-center gap-3">
            <span className="h-px w-10 bg-signal" />
            Folha de Coqueiros · jornalismo local · inteligência de dados
          </p>

          <h1
            className="mt-8 animate-entrada-pagina text-[clamp(3rem,10vw,8.5rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-ink"
            style={{ animationDelay: "80ms" }}
          >
            Coqueiros
            <br />
            em{" "}
            <span className="titulo-serif tracking-[-0.02em] [text-shadow:0_0_48px_rgb(var(--signal)/0.45)]">
              dados.
            </span>
          </h1>

          <p
            className="mt-8 max-w-xl animate-entrada-pagina text-lg leading-relaxed text-muted"
            style={{ animationDelay: "200ms" }}
          >
            Inteligência gerada sobre notícias do bairro de Coqueiros,
            Florianópolis: quem aparece, do que se fala, o que vem por aí.
            Escolha um caminho e aprofunde no seu ritmo.
          </p>

          <div
            className="mt-10 flex animate-entrada-pagina flex-wrap items-center gap-3"
            style={{ animationDelay: "320ms" }}
          >
            <a href="#modulos" className="botao-primario px-5 py-3">
              Escolher um módulo
              <ArrowDown size={15} />
            </a>
            <button
              type="button"
              onClick={onAbrirChat}
              className="botao-secundario px-5 py-3"
            >
              <Sparkles size={15} />
              Perguntar à IA
            </button>
          </div>
        </div>
      </section>

      {/* --- Números do acervo --- */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <Revelar>
          <div className="flex items-end justify-between gap-4 pb-4">
            <p className="rotulo">O acervo em números</p>
            <p className="rotulo text-faint">
              {mesAno(periodo.inicio)} — {mesAno(periodo.fim)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
            <Numero indice="01" rotulo="Notícias" valor={numeros.noticias} />
            <Numero
              indice="02"
              rotulo="Atores mapeados"
              valor={numeros.atores}
            />
            <Numero indice="03" rotulo="Eventos" valor={numeros.eventos} />
            <Numero
              indice="04"
              rotulo="Categorias"
              valor={numeros.categorias}
            />
          </div>
        </Revelar>
      </section>

      {/* --- Módulos --- */}
      <section
        id="modulos"
        className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
      >
        <Revelar className="grid gap-6 pb-12 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="rotulo flex items-center gap-3">
              <span className="h-px w-10 bg-signal" />
              Módulos
            </p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl">
              Quatro formas de
              <br />
              <span className="titulo-serif">ler o bairro.</span>
            </h2>
          </div>
          <p className="max-w-md text-base text-muted lg:justify-self-end">
            Cada módulo abre uma pergunta. Comece pelo panorama ou vá direto ao
            que interessa — os filtros acompanham você entre as páginas.
          </p>
        </Revelar>

        <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((modulo, i) => (
            // O fundo fica fora do <Revelar>: a célula não "fura" a grade enquanto o conteúdo entra.
            <div key={modulo.rota} className="bg-canvas">
              <Revelar atraso={(i % 3) * 90} className="h-full">
                <a
                  href={hrefDe(modulo.rota)}
                  className="group flex h-full min-h-[15rem] flex-col p-7 transition"
                  style={
                    {
                      "--brilho-raio": "320px",
                      "--brilho-forca": "0.1",
                    } as CSSProperties
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="rotulo">
                      <span className="text-signal">{modulo.indice}</span> ·{" "}
                      {modulo.rotulo}
                    </span>
                    <modulo.Icone
                      size={18}
                      className="text-faint transition duration-500 group-hover:text-signal"
                    />
                  </div>
                  <h3 className="mt-auto pt-10 text-2xl font-semibold tracking-tight text-ink">
                    {modulo.titulo}{" "}
                    <span className="titulo-serif">{modulo.destaque}</span>
                  </h3>
                  <p className="mt-2 text-sm text-muted">{modulo.descricao}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-faint transition group-hover:text-signal">
                    Abrir
                    <ArrowUpRight
                      size={13}
                      className="transition-transform duration-500 ease-suave group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </span>
                </a>
              </Revelar>
            </div>
          ))}

          {/* Célula final: atalho para o assistente */}
          <div className="bg-canvas sm:col-span-2 lg:col-span-2">
            <Revelar atraso={180} className="h-full">
              <button
                type="button"
                onClick={onAbrirChat}
                className="group flex h-full min-h-[15rem] w-full flex-col p-7 text-left"
                style={
                  {
                    "--brilho-raio": "420px",
                    "--brilho-forca": "0.12",
                  } as CSSProperties
                }
              >
                <span className="rotulo">
                  <span className="text-signal">IA</span> · Assistente editorial
                </span>
                <span className="mt-auto pt-10 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Prefere <span className="titulo-serif">perguntar?</span>
                </span>
                <span className="mt-2 max-w-lg text-sm text-muted">
                  Converse com o acervo: o assistente responde citando as
                  matérias do recorte atual.
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-faint transition group-hover:text-signal">
                  <Sparkles size={13} /> Abrir assistente
                </span>
              </button>
            </Revelar>
          </div>
        </div>
      </section>
    </div>
  );
}
