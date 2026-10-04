/**
 * Catálogo de provedores de IA e listagem de modelos.
 *
 * Todas as chamadas partem do navegador direto para o provedor (todos os
 * listados aqui aceitam CORS): a chave do usuário nunca passa por servidores
 * da Folha. A lista é fechada de propósito — os mesmos domínios estão no
 * `connect-src` da Content-Security-Policy (netlify.toml), o que impede que
 * um script injetado exfiltre a chave para outro destino.
 */

export type FormatoAPI = 'openai' | 'anthropic' | 'gemini';

export type IdProvedor =
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'perplexity'
  | 'cohere'
  | 'moonshot';

export interface Provedor {
  id: IdProvedor;
  nome: string;
  formato: FormatoAPI;
  baseUrl: string;
  /** Onde o usuário cria a chave. */
  urlChaves: string;
  /** Preferências (regex sobre o id) para escolher o modelo padrão da lista. */
  preferencias: RegExp[];
  /** Modelos sugeridos quando o provedor não expõe listagem. */
  sugeridos?: string[];
}

export const PROVEDORES: Record<IdProvedor, Provedor> = {
  openrouter: {
    id: 'openrouter',
    nome: 'OpenRouter',
    formato: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    urlChaves: 'https://openrouter.ai/settings/keys',
    preferencias: [/^openrouter\/free$/],
  },
  openai: {
    id: 'openai',
    nome: 'OpenAI',
    formato: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    urlChaves: 'https://platform.openai.com/api-keys',
    preferencias: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+o?-mini/, /^gpt-/],
  },
  anthropic: {
    id: 'anthropic',
    nome: 'Anthropic',
    formato: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    urlChaves: 'https://console.anthropic.com/settings/keys',
    preferencias: [/haiku/, /sonnet/],
  },
  google: {
    id: 'google',
    nome: 'Google Gemini',
    formato: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    urlChaves: 'https://aistudio.google.com/apikey',
    preferencias: [/flash-lite$/, /flash$/, /flash/],
  },
  deepseek: {
    id: 'deepseek',
    nome: 'DeepSeek',
    formato: 'openai',
    baseUrl: 'https://api.deepseek.com',
    urlChaves: 'https://platform.deepseek.com/api_keys',
    preferencias: [/^deepseek-chat$/],
  },
  groq: {
    id: 'groq',
    nome: 'Groq',
    formato: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    urlChaves: 'https://console.groq.com/keys',
    preferencias: [/llama.*70b/, /llama/],
  },
  mistral: {
    id: 'mistral',
    nome: 'Mistral',
    formato: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    urlChaves: 'https://console.mistral.ai/api-keys',
    preferencias: [/^mistral-small-latest$/, /^mistral-medium-latest$/, /latest$/],
  },
  xai: {
    id: 'xai',
    nome: 'xAI (Grok)',
    formato: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    urlChaves: 'https://console.x.ai',
    preferencias: [/grok.*mini/, /^grok/],
  },
  together: {
    id: 'together',
    nome: 'Together AI',
    formato: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    urlChaves: 'https://api.together.ai/settings/api-keys',
    preferencias: [/llama.*instruct/i, /instruct/i],
  },
  fireworks: {
    id: 'fireworks',
    nome: 'Fireworks AI',
    formato: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    urlChaves: 'https://fireworks.ai/account/api-keys',
    preferencias: [/llama.*instruct/i, /instruct/i],
  },
  cerebras: {
    id: 'cerebras',
    nome: 'Cerebras',
    formato: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    urlChaves: 'https://cloud.cerebras.ai',
    preferencias: [/llama/i],
  },
  perplexity: {
    id: 'perplexity',
    nome: 'Perplexity',
    formato: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    urlChaves: 'https://www.perplexity.ai/settings/api',
    preferencias: [],
    sugeridos: ['sonar', 'sonar-pro'],
  },
  cohere: {
    id: 'cohere',
    nome: 'Cohere',
    formato: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    urlChaves: 'https://dashboard.cohere.com/api-keys',
    preferencias: [/command/],
  },
  moonshot: {
    id: 'moonshot',
    nome: 'Moonshot (Kimi)',
    formato: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    urlChaves: 'https://platform.moonshot.ai/console/api-keys',
    preferencias: [/kimi/, /moonshot/],
  },
};

/** Provedores do modo "chave própria" (o OpenRouter tem login dedicado). */
export const PROVEDORES_BYOK = Object.values(PROVEDORES).filter((p) => p.id !== 'openrouter');

export const MODELO_OPENROUTER_PADRAO = 'openrouter/free';

export interface Conexao {
  provedor: IdProvedor;
  chave: string;
  /** `oauth` = login OpenRouter (PKCE); `byok` = chave colada pelo usuário. */
  origem: 'oauth' | 'byok';
}

export interface ModeloIA {
  id: string;
  nome: string;
  gratuito?: boolean;
  /** Janela de contexto em tokens, quando informada. */
  contexto?: number;
}

/** Cabeçalhos de autenticação de cada formato de API. */
export function cabecalhosAuth(conexao: Conexao): Record<string, string> {
  const provedor = PROVEDORES[conexao.provedor];
  switch (provedor.formato) {
    case 'anthropic':
      return {
        'x-api-key': conexao.chave,
        'anthropic-version': '2023-06-01',
        // Exigido pela Anthropic para chamadas a partir do navegador.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    case 'gemini':
      return { 'x-goog-api-key': conexao.chave };
    default:
      return {
        Authorization: `Bearer ${conexao.chave}`,
        ...(conexao.provedor === 'openrouter'
          ? {
              'HTTP-Referer': typeof window === 'undefined' ? 'https://folhadecoqueiros.com.br' : window.location.origin,
              'X-Title': 'Folha de Coqueiros',
            }
          : {}),
      };
  }
}

/** Modelos que não geram texto de chat (embeddings, áudio, imagem…). */
const NAO_CHAT = /embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcri|search|rerank|vision-preview|guard|ocr/i;

interface RespostaModelosOpenRouter {
  data: Array<{
    id: string;
    name: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    architecture?: { output_modalities?: string[] };
  }>;
}

/** Lista os modelos disponíveis para a conexão (lança erro amigável se a chave for recusada). */
export async function listarModelos(conexao: Conexao, signal?: AbortSignal): Promise<ModeloIA[]> {
  const provedor = PROVEDORES[conexao.provedor];

  if (provedor.id === 'openrouter') {
    const resposta = await fetch(`${provedor.baseUrl}/models`, { signal });
    if (!resposta.ok) throw new Error(`Não foi possível listar os modelos (HTTP ${resposta.status}).`);
    const { data } = (await resposta.json()) as RespostaModelosOpenRouter;
    const modelos = data
      .filter((m) => m.architecture?.output_modalities?.includes('text') ?? true)
      .map((m) => ({
        id: m.id,
        nome: m.name,
        contexto: m.context_length,
        gratuito: m.pricing?.prompt === '0' && m.pricing?.completion === '0',
      }));
    return ordenar(modelos, MODELO_OPENROUTER_PADRAO);
  }

  if (provedor.sugeridos) {
    // Sem endpoint de listagem: valida a chave só na primeira mensagem.
    return provedor.sugeridos.map((id) => ({ id, nome: id }));
  }

  const url =
    provedor.formato === 'gemini' ? `${provedor.baseUrl}/models?pageSize=1000` : `${provedor.baseUrl}/models`;
  const resposta = await fetch(url, { headers: cabecalhosAuth(conexao), signal });
  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error(`O ${provedor.nome} recusou a chave. Confira se ela foi copiada inteira e está ativa.`);
  }
  if (!resposta.ok) {
    throw new Error(`O ${provedor.nome} não respondeu à listagem de modelos (HTTP ${resposta.status}).`);
  }
  const corpo = (await resposta.json()) as Record<string, unknown> | unknown[];

  if (provedor.formato === 'gemini') {
    const lista = ((corpo as { models?: unknown[] }).models ?? []) as Array<{
      name: string;
      displayName?: string;
      inputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
    return ordenar(
      lista
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          id: m.name.replace(/^models\//, ''),
          nome: m.displayName ?? m.name,
          contexto: m.inputTokenLimit,
        }))
        .filter((m) => !NAO_CHAT.test(m.id)),
    );
  }

  // OpenAI-compatível: `{ data: [...] }` (Together devolve o array direto).
  const lista = (Array.isArray(corpo) ? corpo : ((corpo as { data?: unknown[] }).data ?? [])) as Array<{
    id: string;
    display_name?: string;
    name?: string;
    context_length?: number;
    context_window?: number;
  }>;
  return ordenar(
    lista
      .filter((m) => typeof m.id === 'string' && !NAO_CHAT.test(m.id))
      .map((m) => ({
        id: m.id,
        nome: m.display_name ?? m.name ?? m.id,
        contexto: m.context_length ?? m.context_window,
      })),
  );
}

function ordenar(modelos: ModeloIA[], primeiro?: string): ModeloIA[] {
  return [...modelos].sort((a, b) => {
    if (a.id === primeiro) return -1;
    if (b.id === primeiro) return 1;
    if (a.gratuito !== b.gratuito) return a.gratuito ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });
}

/** Escolhe o modelo padrão: o salvo pelo usuário, senão a preferência do provedor, senão o primeiro. */
export function escolherModeloPadrao(
  idProvedor: IdProvedor,
  modelos: ModeloIA[],
  salvo?: string | null,
): string {
  if (salvo && modelos.some((m) => m.id === salvo)) return salvo;
  for (const padrao of PROVEDORES[idProvedor].preferencias) {
    const encontrado = modelos.find((m) => padrao.test(m.id));
    if (encontrado) return encontrado.id;
  }
  return modelos[0]?.id ?? salvo ?? '';
}
