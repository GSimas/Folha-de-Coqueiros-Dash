import { useCallback, useRef, useState, type RefObject } from 'react';
import { Download } from 'lucide-react';
import Popover from './Popover';
import { useCoresGrafico } from '@/lib/preferencias';
import { baixarGrafico, type OpcoesImagem } from '@/lib/exportar';

interface Opcao {
  rotulo: string;
  detalhe: string;
  acao: () => void | Promise<void>;
}

/** Botão "Baixar" com menu de formatos. */
export default function MenuBaixar({
  rotulo,
  opcoes,
  className = '',
  conteudo,
}: {
  rotulo: string;
  opcoes: Opcao[];
  className?: string;
  /** Texto/ícone visível do botão; sem ele, é um botão só de ícone. */
  conteudo?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const fechar = useCallback(() => setAberto(false), []);

  const escolher = async (opcao: Opcao) => {
    setAberto(false);
    setOcupado(true);
    try {
      await opcao.acao();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={conteudo ? undefined : rotulo}
        title={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        disabled={ocupado}
        className={conteudo ? className : `botao-icone shrink-0 ${className}`}
      >
        {conteudo ?? <Download size={14} aria-hidden className={ocupado ? 'animate-pulsar' : ''} />}
      </button>
      <Popover ancora={botaoRef.current} aberto={aberto} onFechar={fechar} className="w-56 p-1.5" rotulo={rotulo}>
        <div role="menu" aria-label={rotulo}>
          {opcoes.map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              role="menuitem"
              onClick={() => escolher(opcao)}
              className="flex w-full flex-col items-start rounded-sm px-3 py-2 text-left transition hover:bg-signal/10"
            >
              <span className="text-sm font-medium text-ink">{opcao.rotulo}</span>
              <span className="text-xs text-muted">{opcao.detalhe}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/** Menu "JPG com fundo / PNG sem fundo" para o gráfico dentro de `alvo`. */
export function BaixarGrafico({
  alvo,
  nome,
  titulo,
  legenda,
  className,
  conteudo,
}: {
  alvo: RefObject<HTMLElement | null>;
  className?: string;
  conteudo?: React.ReactNode;
  /** Base do nome do arquivo. */
  nome: string;
  titulo?: string;
  legenda?: OpcoesImagem['legenda'];
}) {
  const cores = useCoresGrafico();
  const baixar = (formato: 'jpg' | 'png') => async () => {
    if (!alvo.current) return;
    await baixarGrafico(alvo.current, formato, nome, {
      titulo,
      legenda,
      fundo: cores.surface,
      texto: cores.ink,
      textoSecundario: cores.muted,
    });
  };
  return (
    <MenuBaixar
      rotulo="Baixar imagem do gráfico"
      className={className}
      conteudo={conteudo}
      opcoes={[
        { rotulo: 'JPG com fundo', detalhe: 'Fundo do tema atual', acao: baixar('jpg') },
        { rotulo: 'PNG sem fundo', detalhe: 'Transparente, para slides e documentos', acao: baixar('png') },
      ]}
    />
  );
}
