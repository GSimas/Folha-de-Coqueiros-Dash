/**
 * `/api/causal` — Extração de relações de causa e efeito para o Diagrama de
 * Enlace Causal (CLD).
 *
 * Recebe as notícias atualmente filtradas na UI e pede ao Gemini que identifique
 * pares causa → efeito com polaridade (reforço/redução) e evidência textual.
 * O processamento é feito em LOTES para caber no limite de contexto e no tempo
 * de execução da função.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { RelacaoCausal } from '../../src/types';

/** Notícia como o frontend a envia (recorte enxuto). */
interface NoticiaEntrada {
  id: number;
  titulo: string;
  data: string;
  conteudo: string;
}

interface CausalRequest {
  noticias: NoticiaEntrada[];
  modelo?: string;
}

const MODELOS_PERMITIDOS = new Set([
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);
const MODELO_PADRAO = 'gemini-2.5-flash';

/** Limites de segurança: contexto do modelo e tempo de execução da função. */
const MAX_NOTICIAS = 40;
const TAMANHO_LOTE = 8;
const MAX_CARACTERES_CONTEUDO = 2000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS });
}

const INSTRUCAO_SISTEMA = `Você é um analista de dinâmica de sistemas especializado em jornalismo territorial.

Sua tarefa: ler notícias do bairro de Coqueiros (Florianópolis/SC) e extrair RELAÇÕES CAUSAIS explícitas ou fortemente implícitas, no formato de um Diagrama de Enlace Causal (Causal Loop Diagram).

REGRAS:
1. Cada relação liga uma VARIÁVEL causa a uma VARIÁVEL efeito.
2. Variáveis devem ser substantivos mensuráveis e GENÉRICOS o bastante para se repetirem entre notícias — ex.: "Fluxo de turistas", "Filas no posto de saúde", "Obras de mobilidade", "Poluição da praia". Use no máximo 4 palavras. Nunca use nomes próprios de pessoas como variável.
3. Polaridade:
   - "increase": quando a causa aumenta, o efeito também aumenta (enlace de reforço, +).
   - "decrease": quando a causa aumenta, o efeito diminui (enlace de balanço, −).
4. "evidencia" deve ser um trecho CURTO e literal da notícia que sustenta a relação. Nunca invente.
5. Reaproveite exatamente o mesmo nome de variável quando o conceito se repetir — é isso que faz o diagrama conectar notícias diferentes.
6. Se uma notícia não contiver relação causal clara, simplesmente não gere relação para ela. Qualidade acima de quantidade.
7. Responda SEMPRE em português do Brasil.`;

const SCHEMA_RESPOSTA = {
  type: Type.OBJECT,
  properties: {
    relacoes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          causa: { type: Type.STRING, description: 'Variável de origem (a causa).' },
          efeito: { type: Type.STRING, description: 'Variável de destino (o efeito).' },
          polaridade: {
            type: Type.STRING,
            enum: ['increase', 'decrease'],
            description: 'increase = reforço (+); decrease = balanço (−).',
          },
          evidencia: {
            type: Type.STRING,
            description: 'Trecho literal e curto da notícia que sustenta a relação.',
          },
          noticiaId: {
            type: Type.INTEGER,
            description: 'ID da notícia de onde a relação foi extraída.',
          },
        },
        required: ['causa', 'efeito', 'polaridade', 'evidencia', 'noticiaId'],
      },
    },
  },
  required: ['relacoes'],
};

function limpar(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/** Normaliza o nome de uma variável para agrupar equivalentes ("Filas " ≡ "filas"). */
function chaveVariavel(nome: string): string {
  return limpar(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return responder({ erro: 'Método não permitido. Use POST.' }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return responder(
      {
        erro:
          'GEMINI_API_KEY não configurada. Defina a variável de ambiente no painel do Netlify (Site settings → Environment variables).',
      },
      500,
    );
  }

  let corpo: CausalRequest;
  try {
    corpo = (await req.json()) as CausalRequest;
  } catch {
    return responder({ erro: 'Corpo da requisição inválido — JSON esperado.' }, 400);
  }

  const entrada = Array.isArray(corpo.noticias) ? corpo.noticias : [];
  if (entrada.length === 0) {
    return responder({ erro: 'Nenhuma notícia enviada para análise.' }, 400);
  }

  const modelo =
    corpo.modelo && MODELOS_PERMITIDOS.has(corpo.modelo) ? corpo.modelo : MODELO_PADRAO;

  // Prioriza notícias com conteúdo substancial — textos curtos raramente
  // carregam uma cadeia causal explícita.
  const noticias = [...entrada]
    .filter((n) => (n.conteudo?.length ?? 0) > 200)
    .sort((a, b) => (b.conteudo?.length ?? 0) - (a.conteudo?.length ?? 0))
    .slice(0, MAX_NOTICIAS);

  if (noticias.length === 0) {
    return responder(
      { erro: 'As notícias filtradas não têm conteúdo suficiente para extrair relações causais.' },
      400,
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const titulosPorId = new Map(noticias.map((n) => [n.id, n.titulo]));

  // Divide em lotes e processa em paralelo — o gargalo é a latência do modelo.
  const lotes: NoticiaEntrada[][] = [];
  for (let i = 0; i < noticias.length; i += TAMANHO_LOTE) {
    lotes.push(noticias.slice(i, i + TAMANHO_LOTE));
  }

  const resultados = await Promise.allSettled(
    lotes.map(async (lote) => {
      const payload = lote.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        data: n.data,
        conteudo: (n.conteudo ?? '').slice(0, MAX_CARACTERES_CONTEUDO),
      }));

      const resposta = await ai.models.generateContent({
        model: modelo,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Extraia as relações causais das notícias a seguir.\n\n${JSON.stringify(payload)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: INSTRUCAO_SISTEMA,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA_RESPOSTA,
        },
      });

      const texto = resposta.text?.trim();
      if (!texto) return [] as RelacaoCausal[];

      const analisado = JSON.parse(texto) as { relacoes?: RelacaoCausal[] };
      return Array.isArray(analisado.relacoes) ? analisado.relacoes : [];
    }),
  );

  const falhas = resultados.filter((r) => r.status === 'rejected');
  // Só desiste se TODOS os lotes falharem; resultados parciais ainda são úteis.
  if (falhas.length === lotes.length) {
    const primeira = falhas[0] as PromiseRejectedResult;
    const detalhe =
      primeira.reason instanceof Error ? primeira.reason.message : String(primeira.reason);
    return responder({ erro: `Falha ao consultar o Gemini: ${detalhe}` }, 502);
  }

  // Consolida: normaliza nomes e deduplica pelo trio causa/efeito/polaridade.
  const porChave = new Map<string, RelacaoCausal>();

  for (const resultado of resultados) {
    if (resultado.status !== 'fulfilled') continue;

    for (const bruta of resultado.value) {
      const causa = limpar(String(bruta.causa ?? ''));
      const efeito = limpar(String(bruta.efeito ?? ''));
      const polaridade = bruta.polaridade === 'decrease' ? 'decrease' : 'increase';

      // Descarta relações degeneradas (sem ponta ou auto-referentes).
      if (!causa || !efeito) continue;
      if (chaveVariavel(causa) === chaveVariavel(efeito)) continue;

      const chave = `${chaveVariavel(causa)}→${chaveVariavel(efeito)}|${polaridade}`;
      if (porChave.has(chave)) continue;

      const noticiaId = Number(bruta.noticiaId);
      porChave.set(chave, {
        causa,
        efeito,
        polaridade,
        evidencia: limpar(String(bruta.evidencia ?? '')),
        noticiaId: Number.isFinite(noticiaId) ? noticiaId : null,
        noticiaTitulo: Number.isFinite(noticiaId) ? (titulosPorId.get(noticiaId) ?? null) : null,
      });
    }
  }

  return responder({
    relacoes: [...porChave.values()],
    noticiasAnalisadas: noticias.length,
    modelo,
  });
};
