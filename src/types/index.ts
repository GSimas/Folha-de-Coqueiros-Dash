/**
 * Tipagens centrais do dashboard Folha de Coqueiros.
 *
 * O acervo foi gerado por um pipeline Python que evoluiu ao longo do tempo, então
 * o JSON bruto é heterogêneo: campos booleanos aparecem ora como `true`, ora como
 * a string `"True"`; ausências aparecem como `null`, `"None"` ou `"N/A"`.
 * Por isso separamos o formato BRUTO (`NoticiaRaw`) do formato NORMALIZADO
 * (`Noticia`), que é o único usado pela aplicação.
 */

// ---------------------------------------------------------------------------
// Notícias
// ---------------------------------------------------------------------------

/** Registro exatamente como sai de `noticias.json`. Tudo é opcional/frouxo. */
export interface NoticiaRaw {
  ID?: number | string | null;
  'Título'?: string | null;
  Data?: string | null;
  URL?: string | null;
  'Conteúdo'?: string | null;
  Categorias?: string | null;
  'Palavras-Chaves'?: string | null;
  'É Evento'?: boolean | string | null;
  'Tipo do Evento'?: string | null;
  'Data do Evento'?: string | null;
  'Data Fim Evento'?: string | null;
  'Local do Evento'?: string | null;
  'Horário do Evento'?: string | null;
  'É Pago'?: boolean | string | null;
  'Valor do Evento'?: string | null;
}

/** Notícia após normalização — contrato estável consumido pelos componentes. */
export interface Noticia {
  id: number;
  titulo: string;
  /** Data original no formato `DD/MM/AAAA`. */
  data: string;
  /** Data convertida; `null` quando a original é inválida ou ausente. */
  dataConvertida: Date | null;
  /** Chave `AAAA-MM` para agregações temporais. */
  mesAno: string;
  url: string;
  conteudo: string;
  categorias: string;
  palavrasChaves: string[];
  /** `true` apenas quando a notícia foi categorizada pela IA. */
  categorizada: boolean;
  /** Nº de palavras do conteúdo. */
  tamanhoTexto: number;
  ehEvento: boolean;
  tipoEvento: string | null;
  dataEvento: string | null;
  dataFimEvento: string | null;
  localEvento: string | null;
  horarioEvento: string | null;
  ehPago: boolean;
  valorEvento: string | null;
}

// ---------------------------------------------------------------------------
// Atores
// ---------------------------------------------------------------------------

export const TIPOS_ATOR = ['Pessoa', 'Organização', 'Local', 'Empresa'] as const;
export type TipoAtor = (typeof TIPOS_ATOR)[number];

/** Registro exatamente como sai de `atores.json`. */
export interface AtorRaw {
  ID_Ator?: number | string | null;
  Nome?: string | null;
  Tipo?: string | null;
  Descricao?: string | null;
  Noticias?: Array<number | string> | null;
}

export interface Ator {
  id: number;
  nome: string;
  /** Tipo canônico; `'Desconhecido'` quando não classificado. */
  tipo: TipoAtor | 'Desconhecido';
  descricao: string;
  /** IDs das notícias em que o ator é citado. */
  noticias: number[];
}

/** Ator enriquecido com as métricas de Social Network Analysis. */
export interface AtorComSNA extends Ator {
  /** Nº de citações (tamanho de `noticias`). */
  citacoes: number;
  /** Nº de conexões diretas no grafo de coocorrência. */
  grauAbsoluto: number;
  /** Grau normalizado por `n - 1`. */
  centralidadeGrau: number;
  /** Intermediação (Brandes) — capacidade de servir de "ponte". */
  betweenness: number;
  /** Proximidade — quão perto o ator está dos demais. */
  closeness: number;
}

// ---------------------------------------------------------------------------
// Grafo / SNA
// ---------------------------------------------------------------------------

export interface NoGrafo {
  id: string;
  label: string;
  /** Métrica de tamanho: citações (atores) ou frequência (palavras-chave). */
  valor: number;
  tipo: TipoAtor | 'Desconhecido' | 'Termo';
  descricao?: string;
  grau: number;
  betweenness: number;
  closeness: number;
}

export interface ArestaGrafo {
  origem: string;
  destino: string;
  /** Nº de notícias compartilhadas entre os dois nós. */
  peso: number;
}

export interface GrafoSNA {
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

/** Métricas SNA calculadas para um recorte do grafo, indexadas por nome do nó. */
export interface MetricasSNA {
  grau: Record<string, number>;
  centralidadeGrau: Record<string, number>;
  betweenness: Record<string, number>;
  closeness: Record<string, number>;
}

export type TipoRede = 'atores' | 'palavras-chave';

// ---------------------------------------------------------------------------
// Diagrama de Enlace Causal (CLD)
// ---------------------------------------------------------------------------

export type PolaridadeCausal = 'increase' | 'decrease';

export interface RelacaoCausal {
  /** Variável de origem (a causa). */
  causa: string;
  /** Variável de destino (o efeito). */
  efeito: string;
  /** `increase` = enlace de reforço (+); `decrease` = enlace de balanço (−). */
  polaridade: PolaridadeCausal;
  /** Trecho literal da notícia que sustenta a relação. */
  evidencia: string;
  /** ID da notícia de origem, quando identificável. */
  noticiaId?: number | null;
  /** Título da notícia de origem, para rastreabilidade. */
  noticiaTitulo?: string | null;
}

export interface RespostaCausal {
  relacoes: RelacaoCausal[];
  /** Nº de notícias efetivamente enviadas ao modelo. */
  noticiasAnalisadas: number;
  modelo: string;
}

// ---------------------------------------------------------------------------
// Chat / RAG
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Momento em que a mensagem foi criada (epoch ms) — exibido como timestamp. */
  criadaEm: number;
  /** Marca mensagens em carregamento para renderizar o skeleton (nenhum caractere chegou ainda). */
  carregando?: boolean;
  /** `true` enquanto o texto ainda está chegando pelo stream. */
  streaming?: boolean;
  erro?: boolean;
  /** Modelo e provedor que geraram a resposta — rótulo de transparência. */
  modelo?: string;
  /** URLs do acervo enviadas como contexto; links fora desta lista são sinalizados. */
  urlsVerificadas?: string[];
  /** Resposta interrompida pelo limite de tokens — a interface oferece "continuar". */
  cortado?: boolean;
  /** Pergunta que originou a resposta (para continuar com o mesmo contexto). */
  pergunta?: string;
  suspeitaInjecao?: boolean;
}

export interface MetricasGerais {
  totalNoticias: number;
  mediaPalavras: number;
  categorizadas: number;
  totalEventos: number;
  eventosPagos: number;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface Filtros {
  dataInicio: string;
  dataFim: string;
  categorias: string[];
  apenasEventos: boolean;
  busca: string;
}
