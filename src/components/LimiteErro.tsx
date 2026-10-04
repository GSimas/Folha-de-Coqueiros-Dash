import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface LimiteErroProps {
  /** Nome da área, para a mensagem ("o grafo", "o perfil"…). */
  area: string;
  children: ReactNode;
  /** Muda quando o conteúdo deve ser tentado de novo (ex.: troca de página). */
  chave?: unknown;
}

interface Estado {
  erro: Error | null;
}

/** Falha ao baixar um chunk (ex.: deploy novo removeu o arquivo antigo). */
const ehFalhaDeChunk = (erro: Error) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(erro.message);

/**
 * Isola falhas de renderização: se um gráfico quebrar com dados atípicos, só
 * aquela área mostra o aviso com "Tentar novamente" — o resto do painel segue.
 */
export default class LimiteErro extends Component<LimiteErroProps, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(`[${this.props.area}]`, erro, info.componentStack);
  }

  componentDidUpdate(anterior: LimiteErroProps) {
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null });
  }

  private tentarDeNovo = () => {
    // React.lazy guarda a promessa rejeitada: só recarregar busca o chunk novo.
    if (this.state.erro && ehFalhaDeChunk(this.state.erro)) window.location.reload();
    else this.setState({ erro: null });
  };

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="card p-10 text-center" role="alert">
        <AlertTriangle size={24} className="mx-auto mb-3 text-rose-500" aria-hidden />
        <p className="text-base font-medium text-ink">
          Não foi possível exibir <span className="titulo-serif">{this.props.area}.</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {ehFalhaDeChunk(this.state.erro)
            ? 'O painel foi atualizado ou a conexão caiu. Recarregue para continuar.'
            : 'Algo inesperado aconteceu com estes dados. O restante do painel continua funcionando.'}
        </p>
        <button type="button" onClick={this.tentarDeNovo} className="botao-secundario mt-5">
          <RotateCcw size={14} aria-hidden /> Tentar novamente
        </button>
      </div>
    );
  }
}
