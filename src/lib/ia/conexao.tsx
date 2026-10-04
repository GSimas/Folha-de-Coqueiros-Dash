import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  MODELO_OPENROUTER_PADRAO,
  PROVEDORES,
  escolherModeloPadrao,
  listarModelos,
  type Conexao,
  type ModeloIA,
} from './provedores';
import { concluirLoginOpenRouter, iniciarLoginOpenRouter } from './openrouter';

/**
 * Estado da conexão de IA, compartilhado pelo assistente e pelo mapa causal.
 *
 * Armazenamento da credencial: sessionStorage por padrão (some ao fechar a
 * aba); localStorage só se o usuário marcar "manter conectado". Nada vai para
 * servidores da Folha.
 */

const CHAVE_CONEXAO = 'folha:ia:conexao';
const chaveModelo = (provedor: string) => `folha:ia:modelo:${provedor}`;

function lerArmazenado(): { conexao: Conexao | null; lembrar: boolean } {
  for (const [armazenamento, lembrar] of [
    [localStorage, true],
    [sessionStorage, false],
  ] as const) {
    try {
      const bruto = armazenamento.getItem(CHAVE_CONEXAO);
      if (!bruto) continue;
      const conexao = JSON.parse(bruto) as Conexao;
      if (conexao?.chave && PROVEDORES[conexao.provedor]) return { conexao, lembrar };
    } catch {
      // Armazenamento indisponível ou corrompido: segue sem conexão.
    }
  }
  return { conexao: null, lembrar: false };
}

function gravar(conexao: Conexao | null, lembrar: boolean) {
  try {
    localStorage.removeItem(CHAVE_CONEXAO);
    sessionStorage.removeItem(CHAVE_CONEXAO);
    if (conexao) (lembrar ? localStorage : sessionStorage).setItem(CHAVE_CONEXAO, JSON.stringify(conexao));
  } catch {
    // Sem armazenamento: a conexão vale só enquanto a página estiver aberta.
  }
}

interface ContextoIA {
  conexao: Conexao | null;
  lembrar: boolean;
  setLembrar: (lembrar: boolean) => void;
  modelo: string;
  setModelo: (modelo: string) => void;
  modelos: ModeloIA[];
  carregandoModelos: boolean;
  erroModelos: string | null;
  /** Valida a chave listando os modelos; lança erro amigável se recusada. */
  conectar: (conexao: Conexao) => Promise<void>;
  desconectar: () => void;
  entrarComOpenRouter: () => Promise<void>;
  estadoLogin: 'ocioso' | 'concluindo' | 'erro';
  erroLogin: string | null;
  /** `true` logo após voltar do login do OpenRouter — o App abre o assistente. */
  acabouDeEntrar: boolean;
  consumirEntrada: () => void;
}

const Contexto = createContext<ContextoIA | null>(null);

export function IAProvider({ children }: { children: ReactNode }) {
  const inicial = useMemo(lerArmazenado, []);
  const [conexao, setConexao] = useState<Conexao | null>(inicial.conexao);
  const [lembrar, setLembrarEstado] = useState(inicial.lembrar);
  const [modelo, setModeloEstado] = useState('');
  const [modelos, setModelos] = useState<ModeloIA[]>([]);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const [erroModelos, setErroModelos] = useState<string | null>(null);
  const [estadoLogin, setEstadoLogin] = useState<ContextoIA['estadoLogin']>('ocioso');
  const [erroLogin, setErroLogin] = useState<string | null>(null);
  const [acabouDeEntrar, setAcabouDeEntrar] = useState(false);

  // Retorno do OAuth: troca o `?code=` pela chave do usuário.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('code')) return;
    setEstadoLogin('concluindo');
    concluirLoginOpenRouter()
      .then((resultado) => {
        if (!resultado) return setEstadoLogin('ocioso');
        const nova: Conexao = { provedor: 'openrouter', chave: resultado.chave, origem: 'oauth' };
        gravar(nova, resultado.lembrar);
        setLembrarEstado(resultado.lembrar);
        setConexao(nova);
        setEstadoLogin('ocioso');
        setAcabouDeEntrar(true);
      })
      .catch((erro: unknown) => {
        setEstadoLogin('erro');
        setErroLogin(erro instanceof Error ? erro.message : 'Falha no login.');
        setAcabouDeEntrar(true);
      });
  }, []);

  // Carrega os modelos sempre que a conexão muda.
  useEffect(() => {
    if (!conexao) {
      setModelos([]);
      setModeloEstado('');
      return;
    }
    const controle = new AbortController();
    setCarregandoModelos(true);
    setErroModelos(null);
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(chaveModelo(conexao.provedor));
    } catch {
      /* sem armazenamento */
    }
    listarModelos(conexao, controle.signal)
      .then((lista) => {
        setModelos(lista);
        setModeloEstado(escolherModeloPadrao(conexao.provedor, lista, salvo));
      })
      .catch((erro: unknown) => {
        if (controle.signal.aborted) return;
        setErroModelos(erro instanceof Error ? erro.message : 'Falha ao listar modelos.');
        // Sem lista, ainda dá para digitar o id do modelo manualmente.
        setModeloEstado(salvo ?? (conexao.provedor === 'openrouter' ? MODELO_OPENROUTER_PADRAO : ''));
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregandoModelos(false);
      });
    return () => controle.abort();
  }, [conexao]);

  const setModelo = useCallback(
    (novo: string) => {
      setModeloEstado(novo);
      if (!conexao) return;
      try {
        localStorage.setItem(chaveModelo(conexao.provedor), novo);
      } catch {
        /* sem armazenamento */
      }
    },
    [conexao],
  );

  const setLembrar = useCallback(
    (valor: boolean) => {
      setLembrarEstado(valor);
      gravar(conexao, valor);
    },
    [conexao],
  );

  const conectar = useCallback(
    async (nova: Conexao) => {
      // Valida antes de aceitar (exceto provedores sem endpoint de listagem).
      await listarModelos(nova);
      gravar(nova, lembrar);
      setConexao(nova);
    },
    [lembrar],
  );

  const desconectar = useCallback(() => {
    gravar(null, false);
    setConexao(null);
    setErroModelos(null);
  }, []);

  const entrarComOpenRouter = useCallback(async () => {
    setErroLogin(null);
    try {
      await iniciarLoginOpenRouter(lembrar);
    } catch (erro) {
      setEstadoLogin('erro');
      setErroLogin(erro instanceof Error ? erro.message : 'Não foi possível iniciar o login.');
    }
  }, [lembrar]);

  const valor = useMemo<ContextoIA>(
    () => ({
      conexao,
      lembrar,
      setLembrar,
      modelo,
      setModelo,
      modelos,
      carregandoModelos,
      erroModelos,
      conectar,
      desconectar,
      entrarComOpenRouter,
      estadoLogin,
      erroLogin,
      acabouDeEntrar,
      consumirEntrada: () => setAcabouDeEntrar(false),
    }),
    [
      conexao,
      lembrar,
      setLembrar,
      modelo,
      setModelo,
      modelos,
      carregandoModelos,
      erroModelos,
      conectar,
      desconectar,
      entrarComOpenRouter,
      estadoLogin,
      erroLogin,
      acabouDeEntrar,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useIA(): ContextoIA {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useIA precisa de <IAProvider>');
  return contexto;
}
