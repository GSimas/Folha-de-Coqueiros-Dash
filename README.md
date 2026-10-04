# 🗞️ Dashboard Analítico e IA — Folha de Coqueiros

![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg?logo=vite&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-static-00C7B7.svg?logo=netlify&logoColor=white)
![OpenRouter](https://img.shields.io/badge/IA-OpenRouter_%7C_BYOK-6f9fd8.svg)

Painel de inteligência territorial sobre o acervo histórico do jornal local **Folha de Coqueiros** (Florianópolis/SC). Combina análise de redes sociais, dinâmica de sistemas e IA generativa para revelar o panorama editorial, social e de infraestrutura do bairro.

> **Migração:** esta é a versão React + TypeScript + Vite, sucessora do painel original em Python/Streamlit. O pipeline Python de crawling e enriquecimento (`utils.py`, `automacao.py`) segue sendo a fonte dos dados; o frontend passou a consumir os JSONs já processados.

---

## ✨ Os três pilares

### 1. 🕸️ Análise de Redes Sociais (SNA)
Grafo interativo de coocorrência entre atores (Pessoas, Organizações, Locais, Empresas) e entre palavras-chave, renderizado com **vis-network** e física Barnes-Hut estabilizada.

As métricas de SNA são calculadas **no browser, em TypeScript puro** (`src/lib/sna.ts`), replicando fielmente o comportamento padrão do NetworkX:

| Métrica | Algoritmo | Leitura |
|---|---|---|
| Grau | contagem de vizinhos | Com quantos atores divide notícias |
| Centralidade de grau | `grau / (n − 1)` | Grau normalizado |
| Betweenness | Brandes, escala `1 / ((n−1)(n−2))` | Papel de **ponte** entre grupos |
| Closeness | BFS + correção Wasserman-Faust | **Proximidade** média da rede inteira |

Os valores foram verificados contra o `networkx` original e batem até a 4ª casa decimal.

### 2. 🔀 Diagrama de Enlace Causal (CLD)
Sob demanda, a IA lê as notícias filtradas e extrai pares **causa → efeito** com polaridade e evidência textual, renderizados com **React Flow** e layout hierárquico via **dagre**:

* **Verde** — enlace de reforço (`increase`, +)
* **Vermelho** — enlace de balanço (`decrease`, −)

Cada relação carrega o trecho literal que a sustenta, exposto numa caixa retrátil de transparência (incluindo o JSON bruto).

### 3. 💬 Assistente Editorial (RAG)
Chatbot que responde sobre todo o acervo e os indicadores do painel, citando as fontes. O usuário conecta a própria IA, de duas formas:

* **Login OpenRouter (principal)** — OAuth PKCE, sem copiar chaves. Padrão: `openrouter/free` (roteador de modelos gratuitos); um seletor com busca dá acesso a todos os modelos do OpenRouter.
* **Chave própria (BYOK)** — OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, xAI, Together, Fireworks, Cerebras, Perplexity, Cohere e Moonshot.

As chamadas vão **direto do navegador ao provedor**: não há backend, e a chave nunca passa por servidores da Folha. Ela fica na `sessionStorage` (ou `localStorage`, se o usuário marcar "manter conectado"). A mesma conexão alimenta o mapa causal.

O contexto combina agregados do acervo completo e do recorte filtrado (categorias, volume mensal/anual, eventos, termos, palavras-chave), rankings de SNA, pares de atores mais conectados e recuperação TF-IDF sobre todas as notícias.

**Guardrails** (`src/lib/ia/guardrails.ts`, testados em `tests/`):
* entrada: limite de tamanho, intervalo mínimo entre envios, remoção de caracteres invisíveis e bloqueio de CPF, cartão (Luhn) e chaves de API;
* injeção de prompt: detecção heurística + aviso explícito ao modelo; o acervo entra delimitado e higienizado como *dado*;
* prompt de sistema com regras de escopo, ética, privacidade, neutralidade política e proibição de inventar fatos ou URLs;
* saída: canário secreto que derruba respostas que vazem as instruções; links fora das fontes enviadas aparecem como "link não verificado";
* transparência (ISO/IEC 42001): aviso de IA aceito antes da primeira mensagem, rótulo "Gerado por IA · modelo" em cada resposta;
* deploy: Content-Security-Policy com `connect-src` restrito aos provedores suportados e sem scripts inline.

Testes: ver [Testes](#5-testes).

### Também no painel
* **KPIs e volume temporal** — agregado ou empilhado por categoria (Recharts)
* **Nuvem de palavras** — clicável, alimenta a busca livre
* **Agenda de eventos** — tipos, pagos vs. gratuitos e tabela detalhada
* **Banco de atores** — tabela ordenável e paginada (TanStack Table)
* **Acervo enriquecido** — base completa com filtros e links diretos

---

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite + TypeScript (`strict`) |
| UI | React 19, Tailwind CSS, Lucide |
| Redes | vis-network + vis-data |
| Diagrama causal | @xyflow/react (React Flow) + dagre |
| Gráficos | Recharts |
| Tabelas | @tanstack/react-table |
| IA | OpenRouter (OAuth PKCE) ou BYOK, direto do navegador — sem backend |
| Hospedagem | Netlify (estático) |

---

## 🚀 Instalação e execução

### 1. Dependências
```bash
npm install
```

### 2. Desenvolvimento
```bash
npm run dev
```
Abra <http://localhost:5174>. Não há chaves a configurar: a IA é conectada por cada usuário no próprio assistente (o login OpenRouter funciona em `localhost`).

### 3. Build de produção
```bash
npm run build
```

### 4. Coleta automática (a cada 3 dias)

O workflow [`coleta_noticias.yml`](.github/workflows/coleta_noticias.yml) roda `automacao.py` a cada 3 dias (06:00 de Brasília) e também sob demanda (**Actions → Coleta e classificação de notícias → Run workflow**):

1. **Coleta** — compara a listagem do site com o banco e baixa toda notícia ausente.
2. **IA** — numa chamada por notícia, classifica (categoria, palavras-chave, evento) e extrai os atores; também recupera pendências antigas, até `LIMITE_IA` (40) por execução.
   O classificador principal é o **Jev** ([TypeSafe](https://docs.typesafe.ai)), em [`classificador_jev.py`](classificador_jev.py). Como o Jev devolve julgamentos tipados em vez de texto, o código acha candidatos no texto (datas, horários, valores, locais, nomes próprios, termos do vocabulário do acervo) e o Jev escolhe entre eles — numa única requisição por notícia. Categoria, evento e gratuidade são perguntas `Choice`/`Noul` diretas; datas relativas ("sábado", "dia 13") são resolvidas em código a partir da data de publicação.
3. **Salva** — atualiza `noticias.json`/`atores.json` na raiz e em `public/data/`, e faz o commit (o Netlify publica em seguida).

Configure em **Settings → Secrets and variables → Actions**:

| Nome | Tipo | Uso |
|---|---|---|
| `TYPESAFE_API_KEY` | secret | Recomendado: classificação com Jev. |
| `JEV_MODELO` | variable | Opcional: fixa uma versão (padrão `jev-latest`). |
| `OPENROUTER_API_KEY` | secret | Alternativa por LLM, padrão `openrouter/free` (gratuito). |
| `GEMINI_API_KEY` | secret | Alternativa por LLM, usada só sem as anteriores. |
| `IA_MODELO` / `IA_CLASSIFICADOR` | variable | Opcional: modelo do LLM; `llm` força o LLM mesmo com a chave TypeSafe. |

Se a IA falhar (chave inválida, cota), a coleta é salva mesmo assim e o workflow fica **vermelho** — o GitHub avisa por e-mail. Localmente: `python automacao.py --sem-ia` só coleta. O `npm run build` sincroniza `public/data` automaticamente (`prebuild`).

### 5. Testes

```bash
npm test                                   # 76 testes: guardrails, streaming, contexto, rodadas, Markdown
python3 -m unittest tests/test_automacao.py tests/test_classificador_jev.py  # coleta e classificação (Jev)
IA_CHAVE=sk-or-v1-… npm run avaliar        # avaliação ao vivo do assistente (gera relatorio-avaliacao.md)
```

A avaliação ao vivo faz 14 perguntas a um modelo real e confere as respostas contra os dados: números corretos, fontes verificadas, recusa fora do escopo, resistência a injeção (direta e escondida numa notícia), alucinação, neutralidade política, identidade de IA, idioma e respostas longas com tabela. Variáveis: `IA_PROVEDOR` (padrão `openrouter`) e `IA_MODELO` (padrão `openrouter/free`).

---

## 📂 Estrutura do projeto

```text
├── public/
│   ├── preferencias.js        # Aplica tema/fonte antes da 1ª pintura
│   └── data/                  # Datasets servidos ao browser
│       ├── noticias.json
│       └── atores.json
├── scripts/
│   └── sync-data.mjs          # Copia os JSONs da raiz para public/data
├── tests/                     # Vitest (TS) + unittest (coleta Python)
├── automacao.py               # Coleta + classificação (GitHub Actions, a cada 3 dias)
├── classificador_jev.py       # Classificação com Jev (TypeSafe)
├── src/
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── FiltersDrawer.tsx
│   │   ├── SettingsMenu.tsx   # Tema, fonte, contraste, movimento
│   │   ├── FundoAnimado.tsx   # Rede animada de fundo (canvas)
│   │   ├── SeletorModelo.tsx  # Combobox de modelos de IA
│   │   ├── MetricsOverview.tsx
│   │   ├── WordCloud.tsx
│   │   ├── EventsPanel.tsx
│   │   ├── NetworkGraph.tsx   # vis-network + painel de controle flutuante
│   │   ├── CausalDiagram.tsx  # React Flow + dagre
│   │   ├── ActorsTable.tsx
│   │   ├── NewsTable.tsx
│   │   ├── ChatbotDrawer.tsx
│   │   ├── Markdown.tsx       # Renderizador markdown seguro
│   │   └── SocialIcons.tsx
│   ├── hooks/
│   │   ├── useNetworkData.ts  # Construção do grafo + métricas SNA
│   │   └── useAssistente.ts   # Conversa + guardrails
│   ├── pages/                 # Início e páginas de módulo
│   ├── lib/
│   │   ├── ia/
│   │   │   ├── provedores.ts  # Catálogo, listagem de modelos
│   │   │   ├── cliente.ts     # Streaming OpenAI/Anthropic/Gemini
│   │   │   ├── openrouter.ts  # Login OAuth PKCE
│   │   │   ├── conexao.tsx    # Estado da conexão (React context)
│   │   │   ├── contexto.ts    # Prompt de sistema + RAG
│   │   │   ├── guardrails.ts
│   │   │   └── causal.ts      # Extração do mapa causal
│   │   ├── data.ts            # Carregamento e normalização dos JSONs
│   │   ├── sna.ts             # Brandes, closeness, coocorrência
│   │   └── constantes.ts
│   ├── types/index.ts
│   ├── App.tsx
│   └── main.tsx
├── netlify.toml
└── vite.config.ts
```

### Nota sobre os dados

O acervo foi produzido por um pipeline que evoluiu ao longo do tempo, então o JSON bruto é heterogêneo: campos booleanos aparecem ora como `true`, ora como a string `"True"`; ausências aparecem como `null`, `"None"` ou `"N/A"`. Por isso `src/lib/data.ts` separa o formato **bruto** (`NoticiaRaw`) do **normalizado** (`Noticia`) — nenhum componente toca no dado cru.

---

## 👨‍💻 Desenvolvedor

Desenvolvido por **Gustavo Simas**, mesclando as fronteiras do jornalismo local, engenharia de dados e inteligência artificial.

[![GitHub](https://img.shields.io/badge/GitHub-gsimas-181717?logo=github)](https://github.com/gsimas/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-simasgs-0A66C2?logo=linkedin)](https://www.linkedin.com/in/simasgs/)
[![Medium](https://img.shields.io/badge/Medium-tudoemsimas-black?logo=medium)](https://medium.com/@tudoemsimas)
