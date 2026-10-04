import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversar, ErroIA, type OpcoesChat } from '@/lib/ia/cliente';
import type { Conexao, IdProvedor } from '@/lib/ia/provedores';
import { erroHTTP, eventosOpenAI, simularFetch, sse } from './apoio';

const conexao = (provedor: IdProvedor = 'openrouter', chave = 'sk-or-v1-segredo-de-teste-123456'): Conexao => ({
  provedor,
  chave,
  origem: provedor === 'openrouter' ? 'oauth' : 'byok',
});

const opcoes = (extra: Partial<OpcoesChat> = {}): OpcoesChat => ({
  conexao: conexao(),
  modelo: 'openrouter/free',
  sistema: 'SISTEMA',
  mensagens: [{ role: 'user', content: 'oi' }],
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe('formatos de streaming', () => {
  it('OpenAI-compatível: junta os pedaços, ignora comentários e [DONE]', async () => {
    const chamadas = simularFetch([() => sse([': OPENROUTER PROCESSING\n\n', ...eventosOpenAI('Olá, Coqueiros!')])]);
    const parciais: string[] = [];
    const r = await conversar(opcoes({ onTexto: (t) => parciais.push(t) }));
    expect(r).toEqual({ texto: 'Olá, Coqueiros!', cortado: false });
    expect(parciais.at(-1)).toBe('Olá, Coqueiros!');
    expect(chamadas[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((chamadas[0].corpo.messages as Array<{ role: string }>)[0].role).toBe('system');
    expect(chamadas[0].headers.Authorization).toMatch(/^Bearer /);
    expect(chamadas[0].headers['X-Title']).toBe('Folha de Coqueiros');
  });

  it('suporta evento cortado entre pacotes, CRLF e último evento sem quebra de linha', async () => {
    const evento = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`;
    const bruto = `${evento('Parte 1, ')}\r\n\r\n${evento('parte 2')}`;
    simularFetch([() => sse([bruto.slice(0, 20), bruto.slice(20, 61), bruto.slice(61)])]);
    expect((await conversar(opcoes())).texto).toBe('Parte 1, parte 2');
  });

  it('não corrompe caracteres acentuados divididos entre pacotes', async () => {
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Ação é música' } }] })}\n\n`);
    const meio = bytes.indexOf(0xc3) + 1; // no meio do "ç" (2 bytes em UTF-8)
    simularFetch([() => sse([bytes.slice(0, meio), bytes.slice(meio)])]);
    expect((await conversar(opcoes())).texto).toBe('Ação é música');
  });

  it('Anthropic: texto dos deltas, cabeçalhos de navegador e system separado', async () => {
    const chamadas = simularFetch([
      () =>
        sse([
          'event: message_start\ndata: {"type":"message_start"}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Resposta "}}\n\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        ]),
    ]);
    const r = await conversar(opcoes({ conexao: conexao('anthropic', 'sk-ant-x'), modelo: 'claude' }));
    expect(r).toEqual({ texto: 'Resposta Claude', cortado: false });
    expect(chamadas[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(chamadas[0].corpo.system).toBe('SISTEMA');
  });

  it('Gemini: ignora partes de "pensamento" e usa systemInstruction', async () => {
    const chamadas = simularFetch([
      () =>
        sse([
          'data: {"candidates":[{"content":{"parts":[{"text":"pensando…","thought":true},{"text":"Resposta "}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]},"finishReason":"STOP"}]}\n\n',
        ]),
    ]);
    const r = await conversar(opcoes({ conexao: conexao('google', 'AIza-x'), modelo: 'gemini-x' }));
    expect(r).toEqual({ texto: 'Resposta Gemini', cortado: false });
    expect(chamadas[0].url).toContain('/models/gemini-x:streamGenerateContent?alt=sse');
    expect(chamadas[0].corpo.systemInstruction).toEqual({ parts: [{ text: 'SISTEMA' }] });
  });

  it('OpenAI: usa max_completion_tokens; demais provedores, max_tokens', async () => {
    const chamadas = simularFetch([() => sse(eventosOpenAI('a')), () => sse(eventosOpenAI('b'))]);
    await conversar(opcoes({ conexao: conexao('openai', 'sk-x'), maxTokens: 100 }));
    await conversar(opcoes({ conexao: conexao('groq', 'gsk-x'), maxTokens: 100 }));
    expect(chamadas[0].corpo.max_completion_tokens).toBe(100);
    expect(chamadas[1].corpo.max_tokens).toBe(100);
  });
});

describe('resposta cortada pelo limite de tokens', () => {
  it.each([
    ['OpenAI-compatível', 'openrouter' as const, eventosOpenAI('texto longo…', 'length')],
    [
      'Anthropic',
      'anthropic' as const,
      [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"texto longo…"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
      ],
    ],
    ['Gemini', 'google' as const, ['data: {"candidates":[{"content":{"parts":[{"text":"texto longo…"}]},"finishReason":"MAX_TOKENS"}]}\n\n']],
  ])('%s: sinaliza `cortado`', async (_nome, provedor, eventos) => {
    simularFetch([() => sse(eventos)]);
    const r = await conversar(opcoes({ conexao: conexao(provedor, 'k') }));
    expect(r).toEqual({ texto: 'texto longo…', cortado: true });
  });

  it('bloqueio por filtro de conteúdo sem texto vira erro explicativo', async () => {
    simularFetch([() => sse(eventosOpenAI('', 'content_filter'))]);
    await expect(conversar(opcoes())).rejects.toThrow(/política de conteúdo/);
  });
});

describe('resiliência', () => {
  it('tenta de novo após 429 (respeitando Retry-After) e após erro de rede', async () => {
    let tentativas = 0;
    simularFetch([
      () => erroHTTP(429, 'rate limited', { 'retry-after': '0.01' }),
      () => {
        tentativas++;
        throw new TypeError('Failed to fetch');
      },
      () => sse(eventosOpenAI('ok')),
    ]);
    const r = await conversar(opcoes());
    expect(r.texto).toBe('ok');
    expect(tentativas).toBe(1);
  }, 10_000);

  it('desiste após 3 falhas transitórias com mensagem clara', async () => {
    simularFetch([() => erroHTTP(503, 'overloaded', { 'retry-after': '0.01' })]);
    await expect(conversar(opcoes())).rejects.toThrow(/instável/);
  }, 10_000);

  it('repete sem temperatura quando o modelo a recusa', async () => {
    const chamadas = simularFetch([() => erroHTTP(400, 'Unsupported value: temperature'), () => sse(eventosOpenAI('ok'))]);
    expect((await conversar(opcoes({ conexao: conexao('openai', 'sk-x') }))).texto).toBe('ok');
    expect(chamadas[0].corpo).toHaveProperty('temperature');
    expect(chamadas[1].corpo).not.toHaveProperty('temperature');
  });

  it.each([
    [401, /recusou a chave/],
    [402, /Sem créditos/],
    [404, /Modelo não encontrado/],
    [413, /grande demais/],
  ])('HTTP %i gera mensagem acionável sem nova tentativa', async (status, padrao) => {
    const chamadas = simularFetch([() => erroHTTP(status, 'detalhe')]);
    await expect(conversar(opcoes())).rejects.toThrow(padrao);
    expect(chamadas).toHaveLength(1);
  });

  it('nunca expõe a chave nas mensagens de erro', async () => {
    const chave = 'sk-or-v1-chave-super-secreta-999999';
    simularFetch([() => erroHTTP(401, `Invalid key ${chave}`)]);
    const erro = await conversar(opcoes({ conexao: conexao('openrouter', chave) })).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(ErroIA);
    expect((erro as Error).message).not.toContain(chave);
    expect((erro as Error).message).not.toMatch(/super-secreta/);
  });

  it('erro em pleno stream é propagado com o texto do provedor', async () => {
    simularFetch([
      () => sse([...eventosOpenAI('parcial', null).slice(0, 1), 'data: {"error":{"message":"Provider returned error","code":502}}\n\n']),
    ]);
    await expect(conversar(opcoes())).rejects.toThrow('Provider returned error');
  });

  it('aborta stream travado por inatividade (sem "travar" a interface)', async () => {
    simularFetch([
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(eventosOpenAI('começo', null)[0]));
              // …e nunca mais envia nada nem fecha.
            },
          }),
          { status: 200 },
        ),
    ]);
    await expect(conversar(opcoes({ inatividadeMs: 150 }))).rejects.toThrow(/parou de responder/);
  });

  it('keep-alives do provedor reiniciam o relógio de inatividade', async () => {
    const pedacos = [': PROCESSING\n\n', ': PROCESSING\n\n', ': PROCESSING\n\n', ...eventosOpenAI('chegou')];
    simularFetch([() => sse(pedacos, 80)]);
    expect((await conversar(opcoes({ inatividadeMs: 150 }))).texto).toBe('chegou');
  });

  it('respeita o tempo limite total', async () => {
    simularFetch([() => sse(eventosOpenAI('um texto bem demorado', 'stop', 1), 30)]);
    await expect(conversar(opcoes({ tempoLimiteMs: 100, inatividadeMs: 1000 }))).rejects.toThrow(/demorou demais/);
  });

  it('cancelamento pelo usuário propaga AbortError (não vira mensagem de erro)', async () => {
    simularFetch([() => sse(eventosOpenAI('texto que não termina', 'stop', 1), 30)]);
    const controle = new AbortController();
    setTimeout(() => controle.abort(), 60);
    const erro = await conversar(opcoes({ signal: controle.signal })).catch((e: Error) => e);
    expect(erro).not.toBeInstanceOf(ErroIA);
    expect((erro as Error).name).toBe('AbortError');
  });
});
