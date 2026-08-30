# 🗞️ Dashboard Analítico e IA — Folha de Coqueiros

![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg?logo=vite&logoColor=white)
![Netlify](https://img.shields.io/badge/Netlify-Functions-00C7B7.svg?logo=netlify&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-3.1_%7C_2.5_Flash-orange.svg)

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

* **Verde (`#27ae60`)** — enlace de reforço (`increase`, +)
* **Vermelho (`#c0392b`)** — enlace de balanço (`decrease`, −)

Cada relação carrega o trecho literal que a sustenta, exposto numa caixa retrátil de transparência (incluindo o JSON bruto).

### 3. 💬 Assistente Editorial (RAG)
Chatbot que responde sobre o acervo citando as fontes. O contexto é montado no cliente (recuperação lexical sobre notícias + atores com SNA) e enviado a uma função serverless que consulta o Gemini. Modelos disponíveis: `gemini-3.1-flash-lite-preview` (padrão), `gemini-2.5-flash` e `gemini-2.5-flash-lite`.

**A `GEMINI_API_KEY` nunca chega ao browser** — vive apenas no ambiente serverless do Netlify.

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
| Serverless | Netlify Functions (TypeScript) |
| IA | `@google/genai` |

---

## 🚀 Instalação e execução

### 1. Dependências
```bash
npm install
```

### 2. Chave da API
```bash
cp .env.example .env
```
Preencha `GEMINI_API_KEY` (obtenha em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

Em produção, defina a variável em **Netlify → Site settings → Environment variables**.

### 3. Desenvolvimento

Painel completo, **com** as funções de IA — sobe o Vite (`:5174`) e o servidor de funções (`:9999`) juntos:
```bash
npm run dev:full
```
Abra <http://localhost:5174>.

Só o frontend — tudo funciona, exceto o chat e o mapa causal, que dependem das funções:
```bash
npm run dev
```

> **Por que não `netlify dev`?** O fallback de SPA (`/* → /index.html`) do `netlify.toml` é necessário em produção, mas em desenvolvimento ele intercepta os módulos ES do Vite (`/src/*.tsx`, `/@vite/client`) e os devolve como HTML — a página fica em branco. O `dev:full` evita isso reproduzindo o mapeamento `/api/*` pelo proxy do Vite, sem o catch-all.

### 4. Build de produção
```bash
npm run build
```

### 5. Atualizando os dados

O pipeline Python continua gerando `noticias.json` e `atores.json` na raiz. Depois de rodá-lo, sincronize para a pasta servida pelo Vite:

```bash
npm run sync:data
```

---

## 📂 Estrutura do projeto

```text
├── netlify/
│   └── functions/
│       ├── chat.ts            # Endpoint RAG (Gemini) — /api/chat
│       └── causal.ts          # Extração causal em lote — /api/causal
├── public/
│   └── data/                  # Datasets servidos ao browser
│       ├── noticias.json
│       └── atores.json
├── scripts/
│   └── sync-data.mjs          # Copia os JSONs da raiz para public/data
├── src/
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── SidebarFilters.tsx
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
│   │   └── useGeminiChat.ts   # Cliente do assistente + montagem do contexto
│   ├── lib/
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
