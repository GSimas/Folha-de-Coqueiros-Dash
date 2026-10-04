import { useCallback, useId, useRef, useState } from 'react';
import { Contrast, Moon, Settings, Sun, Wind } from 'lucide-react';
import { usePreferencias, type TamanhoFonte } from '@/lib/preferencias';
import { useDispensar, usePresenca } from '@/lib/motion';

const FONTES: Array<{ valor: TamanhoFonte; rotulo: string; amostra: string }> = [
  { valor: 'p', rotulo: 'Pequeno', amostra: 'text-xs' },
  { valor: 'm', rotulo: 'Médio', amostra: 'text-sm' },
  { valor: 'g', rotulo: 'Grande', amostra: 'text-lg' },
];

function Interruptor({
  rotulo,
  descricao,
  ligado,
  onAlternar,
  Icone,
}: {
  rotulo: string;
  descricao: string;
  ligado: boolean;
  onAlternar: () => void;
  Icone: typeof Contrast;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={onAlternar}
      className="flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left transition hover:bg-slate-100"
    >
      <Icone size={16} className={`shrink-0 transition ${ligado ? 'text-signal' : 'text-faint'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{rotulo}</span>
        <span className="block text-xs text-muted">{descricao}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
          ligado ? 'border-signal bg-signal/25' : 'border-line bg-slate-100'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-300 ${
            ligado ? 'left-[1.1rem] bg-signal shadow-[0_0_10px_rgb(var(--signal))]' : 'left-0.5 bg-faint'
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsMenu() {
  const { preferencias, atualizar } = usePreferencias();
  const [aberto, setAberto] = useState(false);
  const { montado, visivel } = usePresenca(aberto, 220);
  const raizRef = useRef<HTMLDivElement>(null);
  const idPainel = useId();

  const fechar = useCallback(() => setAberto(false), []);
  useDispensar(raizRef, aberto, fechar);

  return (
    <div ref={raizRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`botao-icone ${aberto ? 'bg-slate-100 text-ink' : ''}`}
        aria-label="Configurações de exibição"
        aria-expanded={aberto}
        aria-controls={idPainel}
        title="Configurações"
      >
        <Settings
          size={18}
          className={`transition-transform duration-500 ${aberto ? 'rotate-90' : ''}`}
        />
      </button>

      {montado && (
        <div
          id={idPainel}
          role="dialog"
          aria-label="Configurações de exibição"
          className={`absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[19rem] origin-top-right border border-line bg-elevated/95 p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)] backdrop-blur-xl
                      transition duration-200 ease-suave
                      ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.97] opacity-0'}`}
        >
          <p className="rotulo px-2 pb-2 pt-1.5">Tema</p>
          <div className="grid grid-cols-2 gap-1 px-1">
            {(
              [
                ['claro', 'Claro', Sun],
                ['escuro', 'Escuro', Moon],
              ] as const
            ).map(([valor, rotulo, Icone]) => {
              const ativo = preferencias.tema === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => atualizar({ tema: valor })}
                  className={`flex items-center justify-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium transition ${
                    ativo
                      ? 'border-signal/60 bg-signal/10 text-signal'
                      : 'border-line text-muted hover:border-signal/30 hover:text-ink'
                  }`}
                >
                  <Icone size={15} />
                  {rotulo}
                </button>
              );
            })}
          </div>

          <p className="rotulo px-2 pb-2 pt-4">Tamanho da fonte</p>
          <div className="grid grid-cols-3 gap-1 px-1">
            {FONTES.map(({ valor, rotulo, amostra }) => {
              const ativo = preferencias.fonte === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => atualizar({ fonte: valor })}
                  className={`flex flex-col items-center gap-0.5 rounded-sm border px-2 py-2 transition ${
                    ativo
                      ? 'border-signal/60 bg-signal/10 text-signal'
                      : 'border-line text-muted hover:border-signal/30 hover:text-ink'
                  }`}
                >
                  <span className={`font-serif leading-none ${amostra}`}>Aa</span>
                  <span className="text-[0.6875rem] font-medium">{rotulo}</span>
                </button>
              );
            })}
          </div>

          <p className="rotulo px-2 pb-1 pt-4">Acessibilidade</p>
          <div className="px-0.5 pb-1">
            <Interruptor
              rotulo="Alto contraste"
              descricao="Texto e bordas mais fortes"
              ligado={preferencias.altoContraste}
              onAlternar={() => atualizar({ altoContraste: !preferencias.altoContraste })}
              Icone={Contrast}
            />
            <Interruptor
              rotulo="Reduzir movimento"
              descricao="Desliga animações e transições"
              ligado={preferencias.reduzirMovimento}
              onAlternar={() => atualizar({ reduzirMovimento: !preferencias.reduzirMovimento })}
              Icone={Wind}
            />
          </div>

          <p className="border-t border-line px-2 pb-1 pt-2.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-faint">
            Salvo neste navegador
          </p>
        </div>
      )}
    </div>
  );
}
