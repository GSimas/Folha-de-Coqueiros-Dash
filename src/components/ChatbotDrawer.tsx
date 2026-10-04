import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Eraser,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  User,
  X,
} from 'lucide-react';
import type { AtorComSNA, Filtros, MetricasGerais, Noticia } from '@/types';
import { useAssistente } from '@/hooks/useAssistente';
import { useIA } from '@/lib/ia/conexao';
import { LIMITES } from '@/lib/ia/guardrails';
import { PROVEDORES, PROVEDORES_BYOK, type IdProvedor } from '@/lib/ia/provedores';
import { useFocoPreso, usePresenca } from '@/lib/motion';
import Markdown from './Markdown';
import SeletorModelo from './SeletorModelo';

interface ChatbotDrawerProps {
  aberto: boolean;
  onFechar: () => void;
  /** Abre já com o painel de conexão visível (ex.: vindo do mapa causal). */
  focarConexao?: boolean;
  acervo: Noticia[];
  recorte: Noticia[];
  filtros: Filtros;
  periodoCompleto: { inicio: string; fim: string };
  metricas: MetricasGerais;
  atores: AtorComSNA[];
}

const SUGESTOES = [
  'Quais são os atores mais centrais da rede e por quê?',
  'O que as notícias dizem sobre mobilidade e trânsito?',
  'Quais eventos gratuitos aparecem no recorte atual?',
  'Como o volume de notícias evoluiu ao longo dos anos?',
];

const CHAVE_AVISO = 'folha:ia:aviso-aceito';

const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const FORMATO_COMPLETO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'medium' });

/** Hora da mensagem; data e hora completas no tooltip e no atributo `dateTime`. */
function Horario({ em }: { em: number }) {
  const data = new Date(em);
  return (
    <time dateTime={data.toISOString()} title={FORMATO_COMPLETO.format(data)}>
      {FORMATO_HORA.format(data)}
    </time>
  );
}

function EsqueletoResposta() {
  return (
    <div className="min-w-[180px] py-0.5">
      <p className="rotulo mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="animate-pulse text-signal" />
        Analisando o acervo…
      </p>
      <div className="relative h-px w-44 overflow-hidden bg-line">
        <div className="absolute inset-y-0 w-1/3 animate-barra-carregando bg-signal shadow-[0_0_10px_rgb(var(--signal))]" />
      </div>
    </div>
  );
}

/** Aviso de transparência exigido antes do uso (ISO/IEC 42001 — informação às partes interessadas). */
function AvisoIA({
  aceito,
  onAceitar,
  rotuloModelo,
  nomeProvedor,
}: {
  aceito: boolean;
  onAceitar: () => void;
  rotuloModelo: string;
  nomeProvedor: string;
}) {
  const [expandido, setExpandido] = useState(!aceito);
  useEffect(() => setExpandido(!aceito), [aceito]);

  return (
    <section
      aria-label="Aviso sobre o uso de inteligência artificial"
      className="animate-fade-in border border-signal/30 bg-signal/[0.06]"
    >
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <ShieldCheck size={16} className="shrink-0 text-signal" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Você está conversando com uma inteligência artificial</span>
          {!expandido && (
            <span className="block text-xs text-muted">
              Respostas geradas por {rotuloModelo}. Podem conter erros — confira as fontes.
            </span>
          )}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-faint transition-transform duration-300 ${expandido ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-suave ${expandido ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden" inert={!expandido}>
          <div className="space-y-2.5 px-4 pb-4 text-[0.8125rem] leading-relaxed text-muted">
            <p>
              <strong className="text-ink">O que é.</strong> Um assistente automatizado, baseado em um modelo de
              linguagem de terceiros ({rotuloModelo}). Não é um jornalista nem fala em nome da Folha de Coqueiros.
            </p>
            <p>
              <strong className="text-ink">Com que dados.</strong> Responde somente a partir das notícias e dos
              indicadores públicos deste painel, citando as matérias usadas.
            </p>
            <p>
              <strong className="text-ink">Limitações.</strong> Pode errar, omitir ou interpretar mal. Verifique os
              links citados antes de usar ou divulgar qualquer informação. Não é aconselhamento médico, jurídico ou
              financeiro.
            </p>
            <p>
              <strong className="text-ink">Seus dados.</strong> Suas perguntas e trechos do acervo vão direto do seu
              navegador para {nomeProvedor}, conforme a política de privacidade desse provedor. A Folha não armazena
              suas conversas nem sua chave. Não compartilhe dados pessoais.
            </p>
            <p>
              <strong className="text-ink">Supervisão humana.</strong> As decisões sobre o uso das respostas são
              suas. Encontrou algo incorreto ou inadequado? Avise a redação pelo{' '}
              <a
                href="https://folhadecoqueiros.com.br"
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-sm text-signal underline decoration-signal/40 underline-offset-2"
              >
                site da Folha
              </a>
              .
            </p>
            {!aceito && (
              <button type="button" onClick={onAceitar} className="botao-primario mt-1 w-full">
                Entendi — começar a conversa
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PainelConexao() {
  const ia = useIA();
  const [aba, setAba] = useState<'openrouter' | 'byok'>(
    ia.conexao && ia.conexao.origem === 'byok' ? 'byok' : 'openrouter',
  );
  const [provedor, setProvedor] = useState<IdProvedor>('openai');
  const [chave, setChave] = useState('');
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conectarByok = async () => {
    const limpa = chave.trim();
    if (!limpa) return setErro('Cole a chave de API do provedor.');
    setConectando(true);
    setErro(null);
    try {
      await ia.conectar({ provedor, chave: limpa, origem: 'byok' });
      setChave('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível conectar.');
    } finally {
      setConectando(false);
    }
  };

  if (ia.conexao) {
    const p = PROVEDORES[ia.conexao.provedor];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 animate-pulsar rounded-full bg-signal" />
          <p className="min-w-0 flex-1 text-sm text-ink">
            Conectado a <strong>{p.nome}</strong>
            <span className="block text-xs text-muted">
              {ia.conexao.origem === 'oauth' ? 'Login OpenRouter (PKCE)' : 'Chave própria'} ·{' '}
              {ia.lembrar ? 'salvo neste navegador' : 'só nesta aba'}
            </span>
          </p>
          <button type="button" onClick={ia.desconectar} className="botao-secundario px-3 py-1.5 text-xs">
            <LogOut size={13} /> Sair
          </button>
        </div>

        <div>
          <span className="etiqueta">Modelo</span>
          <SeletorModelo
            modelos={ia.modelos}
            valor={ia.modelo}
            onMudar={ia.setModelo}
            carregando={ia.carregandoModelos}
            temGratuitos={ia.conexao.provedor === 'openrouter'}
          />
          {ia.conexao.provedor === 'openrouter' && ia.modelo === 'openrouter/free' && (
            <p className="mt-1.5 text-xs text-faint">
              O roteador gratuito escolhe automaticamente um modelo free disponível a cada pergunta.
            </p>
          )}
          {ia.erroModelos && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-300">{ia.erroModelos}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="segmentado w-full">
        <button type="button" aria-pressed={aba === 'openrouter'} onClick={() => setAba('openrouter')} className="flex-1">
          OpenRouter
        </button>
        <button type="button" aria-pressed={aba === 'byok'} onClick={() => setAba('byok')} className="flex-1">
          Chave própria
        </button>
      </div>

      {aba === 'openrouter' ? (
        <div key="or" className="animate-fade-in space-y-3">
          <p className="text-[0.8125rem] text-muted">
            Entre com sua conta OpenRouter — login seguro (OAuth PKCE), sem copiar chaves. Há modelos{' '}
            <strong className="text-ink">gratuitos</strong>, e você pode escolher entre todos os disponíveis.
          </p>
          <button
            type="button"
            onClick={() => void ia.entrarComOpenRouter()}
            disabled={ia.estadoLogin === 'concluindo'}
            className="botao-primario w-full"
          >
            {ia.estadoLogin === 'concluindo' ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Concluindo login…
              </>
            ) : (
              <>
                <Plug size={15} /> Entrar com OpenRouter
              </>
            )}
          </button>
          {ia.erroLogin && <p className="text-xs text-rose-600 dark:text-rose-300">{ia.erroLogin}</p>}
        </div>
      ) : (
        <form
          key="byok"
          className="animate-fade-in space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void conectarByok();
          }}
        >
          <label className="block">
            <span className="etiqueta">Provedor</span>
            <select
              className="campo"
              value={provedor}
              onChange={(e) => {
                setProvedor(e.target.value as IdProvedor);
                setErro(null);
              }}
            >
              {PROVEDORES_BYOK.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiqueta flex items-center justify-between">
              Chave de API
              <a
                href={PROVEDORES[provedor].urlChaves}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-sm normal-case tracking-normal text-signal"
              >
                obter chave <ExternalLink size={10} />
              </a>
            </span>
            <input
              type="password"
              className="campo font-mono text-xs"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="cole aqui"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={conectando} className="botao-primario w-full">
            {conectando ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {conectando ? 'Validando…' : 'Validar e conectar'}
          </button>
          {erro && <p className="animate-fade-in text-xs text-rose-600 dark:text-rose-300">{erro}</p>}
        </form>
      )}

      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={ia.lembrar}
          onChange={(e) => ia.setLembrar(e.target.checked)}
          className="mt-0.5 accent-[rgb(var(--signal))]"
        />
        Manter conectado neste navegador (sem marcar, a credencial some ao fechar a aba)
      </label>

      <p className="flex gap-2 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-faint">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-signal" />
        Sua chave fica apenas neste navegador e é enviada diretamente ao provedor — nunca passa pelos servidores da
        Folha de Coqueiros.
      </p>
    </div>
  );
}

export default function ChatbotDrawer({
  aberto,
  onFechar,
  focarConexao,
  acervo,
  recorte,
  filtros,
  periodoCompleto,
  metricas,
  atores,
}: ChatbotDrawerProps) {
  const ia = useIA();
  const { mensagens, carregando, enviar, continuar, parar, limpar, avisoEntrada, setAvisoEntrada } = useAssistente({
    acervo,
    recorte,
    filtros,
    periodoCompleto,
    metricas,
    atores,
  });

  const [rascunho, setRascunho] = useState('');
  const [conexaoAberta, setConexaoAberta] = useState(!ia.conexao);
  const [avisoAceito, setAvisoAceito] = useState(() => {
    try {
      return sessionStorage.getItem(CHAVE_AVISO) === '1';
    } catch {
      return false;
    }
  });
  const fundo = usePresenca(aberto, 300);
  const fimDaListaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const ultima = mensagens[mensagens.length - 1];
  const anuncio = !ultima || ultima.role !== 'assistant'
    ? ''
    : ultima.carregando || ultima.streaming
      ? 'O assistente está respondendo…'
      : `${ultima.erro ? 'Erro do assistente' : 'Resposta do assistente'}: ${ultima.content.slice(0, 600)}`;
  useFocoPreso(dialogoRef, aberto);

  const pronto = Boolean(ia.conexao && ia.modelo) && avisoAceito;
  const nomeProvedor = ia.conexao ? PROVEDORES[ia.conexao.provedor].nome : 'o provedor de IA escolhido';
  const rotuloModelo = ia.conexao && ia.modelo ? `${ia.modelo} (${nomeProvedor})` : 'o modelo que você escolher';

  // Painel de conexão abre sozinho sem conexão e recolhe ao conectar.
  useEffect(() => setConexaoAberta(!ia.conexao), [ia.conexao]);
  useEffect(() => {
    if (aberto && focarConexao) setConexaoAberta(true);
  }, [aberto, focarConexao]);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens]);

  useEffect(() => {
    if (aberto && pronto) {
      const timer = setTimeout(() => entradaRef.current?.focus(), 320);
      return () => clearTimeout(timer);
    }
  }, [aberto, pronto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  const aceitarAviso = () => {
    setAvisoAceito(true);
    try {
      sessionStorage.setItem(CHAVE_AVISO, '1');
    } catch {
      /* sem armazenamento */
    }
  };

  const submeter = async (texto = rascunho) => {
    if (!pronto || carregando) return;
    const enviado = await enviar(texto);
    if (enviado && texto === rascunho) setRascunho('');
  };

  const placeholder = !ia.conexao
    ? 'Conecte um provedor de IA para conversar'
    : !ia.modelo
      ? 'Escolha um modelo'
      : !avisoAceito
        ? 'Leia e aceite o aviso acima para começar'
        : 'Pergunte sobre as notícias, atores ou indicadores…';

  return (
    <>
      {fundo.montado && (
        <div
          className={`fixed inset-0 z-40 bg-canvas/60 backdrop-blur-sm transition-opacity duration-300 ${
            fundo.visivel ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onFechar}
          aria-hidden
        />
      )}

      {/* Sempre montado: a conversa sobrevive ao fechar e reabrir o painel. */}
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-label="Assistente editorial (inteligência artificial)"
        inert={!aberto}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line bg-elevated
                    shadow-[-24px_0_60px_-24px_rgb(0_0_0/0.5)] transition-transform duration-500 ease-suave
                    ${fundo.visivel ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink">
              Assistente <span className="titulo-serif">editorial</span>
              <span className="chip ml-2 translate-y-[-2px] border border-signal/40 font-mono uppercase tracking-wider text-signal">
                IA
              </span>
            </h2>
            <p className="rotulo truncate">
              {ia.conexao ? `${nomeProvedor} · ${ia.modelo || '—'}` : 'sem provedor conectado'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConexaoAberta((v) => !v)}
            className={`botao-icone ${conexaoAberta ? 'bg-signal/10 !text-signal' : ''}`}
            aria-label="Conexão e modelo"
            aria-expanded={conexaoAberta}
            title="Conexão e modelo"
          >
            <Plug size={18} />
          </button>
          <button
            type="button"
            onClick={limpar}
            disabled={mensagens.length === 0}
            className="botao-icone"
            aria-label="Limpar conversa"
            title="Limpar conversa"
          >
            <Eraser size={18} />
          </button>
          <button type="button" onClick={onFechar} className="botao-icone" aria-label="Fechar assistente">
            <X size={18} />
          </button>
        </div>

        {/* Conexão e modelo (acordeão) */}
        <div
          className={`grid border-b border-line transition-[grid-template-rows] duration-500 ease-suave ${
            conexaoAberta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] border-transparent'
          }`}
        >
          <div className="overflow-hidden" inert={!conexaoAberta}>
            <div className="max-h-[60vh] overflow-y-auto bg-canvas/40 px-5 py-4">
              <PainelConexao />
            </div>
          </div>
        </div>

        {/* Conversa */}
        {/* Anúncio para leitores de tela: início e resposta concluída — não cada
            pedaço do stream, que faria o leitor repetir a resposta dezenas de vezes. */}
        <p className="sr-only" role="status">
          {anuncio}
        </p>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" role="log" aria-live="off" aria-label="Conversa">
          <AvisoIA
            aceito={avisoAceito}
            onAceitar={aceitarAviso}
            rotuloModelo={rotuloModelo}
            nomeProvedor={nomeProvedor}
          />

          {mensagens.length === 0 && pronto && (
            <div className="flex flex-col items-center pt-4 text-center">
              <p className="max-w-sm text-2xl font-semibold leading-tight tracking-tight text-ink">
                O que você quer <span className="titulo-serif">saber</span> sobre Coqueiros?
              </p>
              <p className="mt-3 max-w-xs text-sm text-muted">
                Consulto as {acervo.length.toLocaleString('pt-BR')} notícias, {atores.length} atores e os indicadores
                do painel.
              </p>
              <div className="mt-6 w-full space-y-2">
                {SUGESTOES.map((sugestao, i) => (
                  <button
                    key={sugestao}
                    type="button"
                    onClick={() => void submeter(sugestao)}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                    className="group flex w-full animate-fade-in items-center gap-3 rounded-sm border border-line px-3 py-2.5 text-left text-[0.8125rem] text-muted transition hover:border-signal/40 hover:text-ink"
                  >
                    <span className="font-mono text-[0.6875rem] text-faint transition group-hover:text-signal">
                      0{i + 1}
                    </span>
                    {sugestao}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((mensagem) => (
            <div
              key={mensagem.id}
              className={`flex animate-fade-in gap-3 ${mensagem.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                  mensagem.role === 'user'
                    ? 'border-line text-muted'
                    : mensagem.erro
                      ? 'border-rose-500/40 text-rose-500'
                      : 'border-signal/40 text-signal'
                }`}
                aria-hidden
              >
                {mensagem.role === 'user' ? (
                  <User size={14} />
                ) : mensagem.erro ? (
                  <AlertTriangle size={14} />
                ) : (
                  <Bot size={14} />
                )}
              </div>

              <div className="max-w-[85%]">
                <div
                  className={`rounded-md px-4 py-2.5 text-sm leading-relaxed ${
                    mensagem.role === 'user'
                      ? 'bg-signal text-signal-ink'
                      : mensagem.erro
                        ? 'border border-rose-500/30 bg-rose-500/10 text-ink'
                        : 'border border-line bg-surface text-ink'
                  }`}
                >
                  {mensagem.carregando ? (
                    <EsqueletoResposta />
                  ) : mensagem.role === 'user' || mensagem.erro ? (
                    <p className="whitespace-pre-wrap">{mensagem.content}</p>
                  ) : (
                    // Markdown também durante o stream: tabelas e listas se formam à medida que chegam.
                    <>
                      <Markdown
                        texto={mensagem.content}
                        urlsVerificadas={new Set(mensagem.urlsVerificadas ?? [])}
                      />
                      {mensagem.streaming && (
                        <span
                          className="animate-piscar mt-1 inline-block w-[2px] bg-signal align-middle"
                          style={{ height: '1em' }}
                          aria-hidden
                        />
                      )}
                    </>
                  )}
                </div>
                <p
                  className={`mt-1 font-mono text-[0.625rem] uppercase tracking-wider text-faint ${
                    mensagem.role === 'user' ? 'text-right' : ''
                  }`}
                >
                  {mensagem.role === 'assistant' && !mensagem.carregando && !mensagem.erro && (
                    <>Gerado por IA · {mensagem.modelo} · </>
                  )}
                  {mensagem.role === 'assistant' && mensagem.erro && <>Erro · </>}
                  <Horario em={mensagem.criadaEm} />
                </p>
                {mensagem.cortado && (
                  <div className="mt-2 flex animate-fade-in flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-amber-500" />
                      Resposta interrompida pelo limite de tamanho do modelo.
                    </span>
                    <button
                      type="button"
                      onClick={() => continuar(mensagem.id)}
                      disabled={carregando}
                      className="botao-secundario px-2.5 py-1 text-xs"
                    >
                      Continuar resposta
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={fimDaListaRef} />
        </div>

        {/* Entrada */}
        <div className="border-t border-line px-5 py-4">
          {avisoEntrada && (
            <div className="mb-3 flex animate-fade-in items-start gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <span className="flex-1">{avisoEntrada}</span>
              <button type="button" onClick={() => setAvisoEntrada(null)} className="rounded-sm text-faint" aria-label="Dispensar aviso">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={entradaRef}
              rows={1}
              value={rascunho}
              maxLength={LIMITES.caracteresPergunta + 200}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submeter();
                }
              }}
              placeholder={placeholder}
              aria-label="Pergunta ao assistente"
              className="campo max-h-32 min-h-[42px] resize-none py-2.5"
              disabled={!pronto}
            />
            {carregando ? (
              <button
                type="button"
                onClick={parar}
                className="botao-secundario h-[42px] px-3.5"
                aria-label="Parar resposta"
                title="Parar"
              >
                <Square size={14} className="fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submeter()}
                disabled={!pronto || rascunho.trim().length === 0}
                className="botao-primario h-[42px] px-3.5"
                aria-label="Enviar pergunta"
              >
                <Send size={16} />
              </button>
            )}
          </div>

          <p className="mt-2 flex justify-between gap-3 text-[0.6875rem] leading-relaxed text-faint">
            <span>Conteúdo gerado por IA pode conter erros. Verifique as fontes citadas.</span>
            {rascunho.length > LIMITES.caracteresPergunta * 0.8 && (
              <span className={`shrink-0 font-mono ${rascunho.length > LIMITES.caracteresPergunta ? 'text-rose-500' : ''}`}>
                {rascunho.length}/{LIMITES.caracteresPergunta}
              </span>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
