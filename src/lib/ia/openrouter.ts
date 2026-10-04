/**
 * Login no OpenRouter via OAuth PKCE (https://openrouter.ai/docs/use-cases/oauth-pkce).
 *
 * 1. Gera um `code_verifier` aleatório e seu desafio SHA-256, guarda o
 *    verificador na sessionStorage e redireciona para openrouter.ai/auth.
 * 2. O OpenRouter volta para esta página com `?code=…`; trocamos o código +
 *    verificador por uma chave de API do usuário. Sem segredo de aplicação:
 *    o verificador prova que a troca é feita pelo mesmo navegador que iniciou.
 */

const CHAVE_SESSAO = 'folha:ia:pkce';
const VALIDADE_MS = 10 * 60 * 1000;

interface EstadoPKCE {
  verificador: string;
  /** Rota (hash) para onde voltar após o login. */
  retorno: string;
  lembrar: boolean;
  criadoEm: number;
}

function base64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function iniciarLoginOpenRouter(lembrar: boolean): Promise<void> {
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error('O login exige uma conexão segura (HTTPS ou localhost).');
  }
  const verificador = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  const desafio = base64Url(new Uint8Array(hash));

  const estado: EstadoPKCE = {
    verificador,
    retorno: window.location.hash,
    lembrar,
    criadoEm: Date.now(),
  };
  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(estado));

  const callback = `${window.location.origin}${window.location.pathname}`;
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('callback_url', callback);
  url.searchParams.set('code_challenge', desafio);
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
}

export interface ResultadoLogin {
  chave: string;
  lembrar: boolean;
}

let conclusao: Promise<ResultadoLogin | null> | null = null;

/**
 * Conclui o login se a URL trouxer `?code=`. Memorizado no módulo: o código
 * é de uso único, e o StrictMode executa os efeitos duas vezes.
 */
export function concluirLoginOpenRouter(): Promise<ResultadoLogin | null> {
  conclusao ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('code');
    if (!codigo) return null;

    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
    const estado = bruto ? (JSON.parse(bruto) as EstadoPKCE) : null;

    // Limpa o código da barra de endereços e restaura a rota de origem.
    window.history.replaceState(null, '', `${window.location.pathname}${estado?.retorno ?? ''}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    if (!estado || Date.now() - estado.criadoEm > VALIDADE_MS) {
      throw new Error('A sessão de login expirou. Clique em "Entrar com OpenRouter" novamente.');
    }

    const resposta = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: codigo,
        code_verifier: estado.verificador,
        code_challenge_method: 'S256',
      }),
    });
    if (!resposta.ok) {
      throw new Error(`O OpenRouter não confirmou o login (HTTP ${resposta.status}). Tente novamente.`);
    }
    const { key } = (await resposta.json()) as { key?: string };
    if (!key) throw new Error('O OpenRouter não devolveu uma chave.');
    return { chave: key, lembrar: estado.lembrar };
  })();
  return conclusao;
}
