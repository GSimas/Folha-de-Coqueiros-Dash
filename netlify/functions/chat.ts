/**
 * `/api/chat` — Assistente Editorial RAG da Folha de Coqueiros.
 *
 * Recebe o histórico da conversa e o contexto já recortado pelo frontend
 * (notícias filtradas + atores com métricas SNA) e consulta o Gemini.
 * A `GEMINI_API_KEY` vive apenas aqui, no ambiente serverless.
 */
import { GoogleGenAI } from '@google/genai';
import type { ChatRequest, ContextoRAG } from '../../src/types';

const MODELOS_PERMITIDOS = new Set([
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

const MODELO_PADRAO = 'gemini-3.1-flash-lite-preview';

/** Erros transitórios do lado do Google que valem uma nova tentativa. */
const CODIGOS_TRANSITORIOS = ['429', '500', '502', '503', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'];
const MAX_TENTATIVAS = 3;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/**
 * Caractere de controle (NUL) usado como separador para sinalizar um erro
 * que ocorreu DEPOIS que o streaming já começou — quando não é mais possível
 * trocar o status HTTP da resposta. Nunca aparece em texto gerado pelo
 * modelo, então o cliente pode cortar o conteúdo com segurança nesse ponto.
 */
const MARCA_ERRO_NO_STREAM = String.fromCharCode(0);

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS });
}

function ehTransitorio(erro: unknown): boolean {
  const texto = String(erro instanceof Error ? erro.message : erro).toUpperCase();
  return CODIGOS_TRANSITORIOS.some((codigo) => texto.includes(codigo));
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function montarInstrucaoSistema(contexto: ContextoRAG): string {
  const { metricas, atores, noticias } = contexto;

  return `Você é o Consultor Editorial e Analista de Redes da Folha de Coqueiros, jornal comunitário do bairro de Coqueiros (Florianópolis/SC).

ESTATÍSTICAS GERAIS DO ACERVO:
- Total de notícias: ${metricas.totalNoticias}
- Média de palavras por notícia: ${metricas.mediaPalavras}
- Notícias categorizadas pela IA: ${metricas.categorizadas}/${metricas.totalNoticias}
- Eventos identificados: ${metricas.totalEventos} (sendo ${metricas.eventosPagos} pagos)

CONTEXTO DE REDE (ATORES E MÉTRICAS SNA):
${atores.length > 0 ? JSON.stringify(atores) : 'Nenhum ator específico identificado na busca.'}

NOTÍCIAS RELEVANTES (recorte já filtrado pelo usuário):
${noticias.length > 0 ? JSON.stringify(noticias) : 'Nenhuma notícia específica encontrada para esta consulta.'}

DIRETRIZES:
1. Ao falar de pessoas, empresas ou órgãos, use as métricas de SNA para explicar a importância deles no bairro:
   - "Grau" = número de conexões diretas (com quantos outros atores divide notícias);
   - "Betweenness" = papel de ponte entre grupos que, sem esse ator, ficariam isolados;
   - "Closeness" = proximidade média do ator em relação a toda a rede.
2. Cite notícias no formato Markdown [Título](URL). Cite atores pelo nome, usando as descrições fornecidas.
3. Responda SEMPRE em português do Brasil, com tom jornalístico, direto e verificável.
4. Baseie-se exclusivamente no contexto acima. Se a informação não estiver ali, diga explicitamente que o acervo consultado não cobre o assunto — nunca invente dados, datas ou nomes.
5. Seja conciso: use listas e parágrafos curtos.`;
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

  let corpo: ChatRequest;
  try {
    corpo = (await req.json()) as ChatRequest;
  } catch {
    return responder({ erro: 'Corpo da requisição inválido — JSON esperado.' }, 400);
  }

  const { mensagens, modelo, contexto } = corpo;

  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return responder({ erro: 'Nenhuma mensagem enviada.' }, 400);
  }
  if (!contexto?.metricas) {
    return responder({ erro: 'Contexto de dados ausente na requisição.' }, 400);
  }

  const modeloEscolhido = MODELOS_PERMITIDOS.has(modelo) ? modelo : MODELO_PADRAO;

  const ai = new GoogleGenAI({ apiKey });

  const conteudo = mensagens.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // A tentativa de retomada só cobre a ABERTURA do stream (a primeira chamada
  // de rede). Uma vez que os primeiros bytes já foram enviados ao cliente, o
  // status HTTP não pode mais mudar — por isso o corpo do `for` só troca de
  // tentativa enquanto `streamGemini` ainda não existe.
  let streamGemini: AsyncGenerator<{ text?: string }> | null = null;
  let ultimoErro: unknown = null;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      streamGemini = await ai.models.generateContentStream({
        model: modeloEscolhido,
        contents: conteudo,
        config: {
          systemInstruction: montarInstrucaoSistema(contexto),
          temperature: 0.2,
        },
      });
      break;
    } catch (erro) {
      ultimoErro = erro;
      if (!ehTransitorio(erro) || tentativa === MAX_TENTATIVAS) break;
      // Backoff exponencial curto: 1s, 2s — dentro do limite de execução da função.
      await espera(1000 * 2 ** (tentativa - 1));
    }
  }

  if (!streamGemini) {
    const detalhe = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro);
    const transitorio = ehTransitorio(ultimoErro);

    return responder(
      {
        erro: transitorio
          ? 'Os servidores da IA estão sobrecarregados no momento. Aguarde alguns segundos e tente novamente.'
          : `Erro de comunicação com o Gemini: ${detalhe}`,
      },
      transitorio ? 503 : 502,
    );
  }

  const encoder = new TextEncoder();
  let recebeuTexto = false;

  const corpoResposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const parte of streamGemini!) {
          const texto = parte.text;
          if (texto) {
            recebeuTexto = true;
            controller.enqueue(encoder.encode(texto));
          }
        }
        if (!recebeuTexto) {
          controller.enqueue(
            encoder.encode(
              `${MARCA_ERRO_NO_STREAM}O modelo retornou uma resposta vazia. Tente reformular a pergunta.`,
            ),
          );
        }
      } catch (erro) {
        const detalhe = erro instanceof Error ? erro.message : String(erro);
        controller.enqueue(
          encoder.encode(`${MARCA_ERRO_NO_STREAM}Erro de comunicação com o Gemini: ${detalhe}`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(corpoResposta, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Modelo-Gemini': modeloEscolhido,
      'Cache-Control': 'no-cache',
    },
  });
};
