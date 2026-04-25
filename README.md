# 🗞️ Dashboard Analítico e IA - Folha de Coqueiros

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Streamlit](https://img.shields.io/badge/Streamlit-1.x-FF4B4B.svg)
![Gemini AI](https://img.shields.io/badge/Google_Gemini-2.0_Flash_Lite-orange.svg)
![Status](https://img.shields.io/badge/Status-Ativo-success.svg)

Um painel de inteligência desenvolvido para analisar o acervo histórico do jornal local Folha de Coqueiros (de Florianópolis). A aplicação combina análise de dados tradicional com Inteligência Artificial Generativa para extrair metadados, mapear redes semânticas e atuar como um Assistente Editorial Sênior.

---

## ✨ Funcionalidades Principais

* **🤖 Assistente Editorial Híbrido (RAG):** Um chatbot inteligente alimentado pelo **Gemini 2.0 Flash Lite**. Utiliza um motor de busca interno via Pandas para precisão matemática (evitando alucinações de LLM) e cruza métricas globais para fornecer análises ricas com citações e hiperlinks automáticos.
* **🕸️ Rede de Relacionamentos Semânticos:** Grafo interativo (NetworkX + Plotly) que revela coocorrências e conexões entre os temas mais abordados no bairro.
* **☁️ Lexicometria e Nuvem de Palavras:** Visualização interativa (D3/Canvas via WordCloud2.js) com escala relativa matemática, permitindo explorar os termos mais citados no conteúdo, título ou palavras-chave das notícias.
* **📊 Visualização de Volume e Tendências:** Gráficos interativos para analisar o volume temporal de publicações, segmentados por categorias geradas por IA.
* **🗄️ Base de Dados Enriquecida:** Tabela interativa com busca textual avançada e colunas customizadas (status de pagamento de eventos, links diretos, etc.).
* **🕷️ Web Crawling Automático:** Raspagem de dados direta do portal Folha de Coqueiros para manter o acervo (`noticias.json`) sempre atualizado.

---

## 🛠️ Tecnologias Utilizadas

* **Linguagem:** Python
* **Interface e Web App:** [Streamlit](https://streamlit.io/)
* **Análise de Dados:** Pandas, NumPy
* **Visualização:** Plotly Express, Plotly Graph Objects, WordCloud2.js (HTML Components)
* **Redes e Grafos:** NetworkX
* **Inteligência Artificial:** `google-genai` (Google Gemini API)
* **Web Scraping:** Requests, BeautifulSoup4

---

## 🚀 Instalação e Execução

### 1. Pré-requisitos
Certifique-se de ter o Python instalado. Clone este repositório e navegue até a pasta do projeto:

```bash
git clone [https://github.com/GSimas/Folha-de-Coqueiros-Dash.git](https://github.com/GSimas/Folha-de-Coqueiros-Dash.git)
cd Folha-de-Coqueiros-Dash
```

### 2. Instalação das Dependências
Instale as bibliotecas necessárias utilizando o `requirements.txt`:

```bash
pip install -r requirements.txt
```

### 3. Configuração da API Key (Google Gemini)
Para que a Inteligência Artificial funcione, você precisa configurar a sua chave de API do Google. 
Crie uma pasta chamada `.streamlit` na raiz do projeto e dentro dela crie um arquivo chamado `secrets.toml`:

```toml
# Arquivo: .streamlit/secrets.toml
GEMINI_API_KEY = "sua_chave_de_api_aqui"
```

### 4. Executando a Aplicação
Com tudo configurado, rode o servidor do Streamlit:

```bash
streamlit run Geral.py
```
O painel abrirá automaticamente no seu navegador em `http://localhost:8501`.

---

## 📂 Estrutura do Projeto

```text
├── Geral.py                 # Arquivo principal (Interface do Streamlit e Dashboards)
├── utils.py                 # Funções lógicas (Crawling, IA, Chatbot e Grafos)
├── noticias.json            # Banco de dados local enriquecido
├── folhadecoqueiros-logo.jpg # Identidade visual da sidebar
├── requirements.txt         # Dependências do projeto
└── .streamlit/
    └── secrets.toml         # Variáveis de ambiente e chaves de API (não versionado)
```

---

## 👨‍💻 Desenvolvedor

Desenvolvido por **Gustavo Simas**, mesclando as fronteiras do jornalismo local, engenharia de dados e inteligência artificial.

[![GitHub](https://img.shields.io/badge/GitHub-gsimas-181717?logo=github)](https://github.com/gsimas/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-simasgs-0A66C2?logo=linkedin)](https://www.linkedin.com/in/simasgs/)
[![Medium](https://img.shields.io/badge/Medium-tudoemsimas-black?logo=medium)](https://medium.com/@tudoemsimas)