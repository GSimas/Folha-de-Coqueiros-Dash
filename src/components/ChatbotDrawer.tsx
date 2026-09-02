import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Eraser,
  Send,
  Settings2,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { AtorComSNA, MetricasGerais, ModeloGemini, Noticia } from '@/types';
import { MODELOS_GEMINI } from '@/types';
import { useGeminiChat } from '@/hooks/useGeminiChat';
import Markdown from './Markdown';

interface ChatbotDrawerProps {
  aberto: boolean;
  onFechar: () => void;
  noticias: Noticia[];
  atores: AtorComSNA[];
  metricas: MetricasGerais;
}

const SUGESTOES = [
  'Quais são os atores mais centrais da rede e por quê?',
  'O que as notícias dizem sobre mobilidade e trânsito?',
  'Resuma os principais eventos culturais do período.',
  'Quais problemas de infraestrutura aparecem com mais frequência?',
];

/**
 * Indicador de "processando" enquanto a resposta não chega: rótulo explícito +
 * barra de progresso indeterminada (não sabemos a duração real da chamada ao
 * Gemini, então o preenchimento desliza em loop, como um loading bar).
 *
 * A largura da trilha é fixa em PIXELS (`w-44`), de propósito — o balão que a
 * envolve é um item flex sem largura própria, então uma largura percentual
 * colapsaria para 0px e a barra ficaria invisível.
 */
function EsqueletoResposta() {
  return (
    <div className="min-w-[180px] py-0.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Sparkles size={12} className="animate-pulse text-brand-500" />
        Analisando o acervo…
      </p>
      <div className="relative h-1.5 w-44 overflow-hidden rounded-full bg-slate-200">
        <div className="absolute inset-y-0 w-1/3 animate-barra-carregando rounded-full bg-brand-500" />
      </div>
    </div>
  );
}

export default function ChatbotDrawer({
  aberto,
  onFechar,
  noticias,
  atores,
  metricas,
}: ChatbotDrawerProps) {
  const { mensagens, carregando, modelo, setModelo, enviar, limpar } = useGeminiChat({
    noticias,
    atores,
    metricas,
  });

  const [rascunho, setRascunho] = useState('');
  const [configAberta, setConfigAberta] = useState(false);
  const fimDaListaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);

  // Rola para a última mensagem sempre que a conversa avança
  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Foca o campo ao abrir o painel
  useEffect(() => {
    if (aberto) {
      const timer = setTimeout(() => entradaRef.current?.focus(), 320);
      return () => clearTimeout(timer);
    }
  }, [aberto]);

  // Fecha com Esc
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  const submeter = () => {
    const texto = rascunho.trim();
    if (!texto || carregando) return;
    setRascunho('');
    void enviar(texto);
  };

  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]" onClick={onFechar} aria-hidden />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white
                    shadow-2xl transition-transform duration-300 ease-out
                    ${aberto ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!aberto}
      >
        {/* Cabeçalho */}
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="rounded-lg bg-brand-50 p-2">
            <Sparkles size={18} className="text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">Assistente Editorial</h2>
            <p className="truncate text-xs text-slate-500">
              {noticias.length.toLocaleString('pt-BR')} notícias · {atores.length} atores no
              contexto
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConfigAberta((v) => !v)}
            className={`rounded-lg p-2 transition ${
              configAberta ? 'bg-brand-50 text-brand-700' : 'text-slate-400 hover:bg-slate-100'
            }`}
            aria-label="Configurações do modelo"
          >
            <Settings2 size={18} />
          </button>
          <button
            type="button"
            onClick={limpar}
            disabled={mensagens.length === 0}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 disabled:opacity-40"
            aria-label="Limpar conversa"
          >
            <Eraser size={18} />
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"
            aria-label="Fechar assistente"
          >
            <X size={18} />
          </button>
        </header>

        {/* Seletor de modelo */}
        {configAberta && (
          <div className="animate-fade-in border-b border-slate-200 bg-slate-50 px-5 py-4">
            <span className="etiqueta">Modelo de IA</span>
            <div className="space-y-1.5">
              {MODELOS_GEMINI.map((opcao) => (
                <label
                  key={opcao.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
                    modelo === opcao.id
                      ? 'border-brand-400 bg-white ring-1 ring-brand-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="modelo-gemini"
                    className="mt-0.5 h-3.5 w-3.5 text-brand-600 focus:ring-brand-400"
                    checked={modelo === opcao.id}
                    onChange={() => setModelo(opcao.id as ModeloGemini)}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">{opcao.nome}</span>
                    <span className="block text-[11px] text-slate-500">{opcao.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Conversa */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {mensagens.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full bg-brand-50 p-4">
                <Bot size={28} className="text-brand-600" />
              </div>
              <p className="max-w-xs text-sm text-slate-600">
                Consulte tendências, indicadores e detalhes do acervo — com citação das fontes.
              </p>

              <div className="mt-6 w-full space-y-2">
                {SUGESTOES.map((sugestao) => (
                  <button
                    key={sugestao}
                    type="button"
                    onClick={() => void enviar(sugestao)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {sugestao}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            mensagens.map((mensagem) => (
              <div
                key={mensagem.id}
                className={`flex animate-fade-in gap-3 ${
                  mensagem.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    mensagem.role === 'user'
                      ? 'bg-slate-200 text-slate-600'
                      : mensagem.erro
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  {mensagem.role === 'user' ? (
                    <User size={14} />
                  ) : mensagem.erro ? (
                    <AlertTriangle size={14} />
                  ) : (
                    <Bot size={14} />
                  )}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    mensagem.role === 'user'
                      ? 'bg-brand-700 text-white'
                      : mensagem.erro
                        ? 'border border-rose-200 bg-rose-50 text-rose-900'
                        : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {mensagem.carregando ? (
                    <EsqueletoResposta />
                  ) : mensagem.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{mensagem.content}</p>
                  ) : mensagem.streaming ? (
                    // Enquanto o texto ainda está sendo revelado, markdown parcial
                    // (ex.: um `**` sem par ainda) renderizaria de forma estranha —
                    // por isso mostramos texto puro com um cursor piscando, e só
                    // trocamos para o Markdown formatado quando a resposta termina.
                    <p className="whitespace-pre-wrap">
                      {mensagem.content}
                      <span className="animate-piscar ml-0.5 inline-block w-[2px] translate-y-[2px] bg-brand-600 align-middle" style={{ height: '1em' }} />
                    </p>
                  ) : (
                    <Markdown texto={mensagem.content} />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={fimDaListaRef} />
        </div>

        {/* Entrada */}
        <footer className="border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={entradaRef}
              rows={1}
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submeter();
                }
              }}
              placeholder="Pergunte sobre as notícias ou atores de Coqueiros…"
              className="campo max-h-32 min-h-[42px] resize-none py-2.5"
              disabled={carregando}
            />
            <button
              type="button"
              onClick={submeter}
              disabled={carregando || rascunho.trim().length === 0}
              className="botao-primario h-[42px] px-3.5"
              aria-label="Enviar pergunta"
            >
              <Send size={16} />
            </button>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            O assistente responde a partir do recorte filtrado. Verifique sempre as respostas — o
            modelo pode cometer erros.
          </p>
        </footer>
      </aside>
    </>
  );
}
