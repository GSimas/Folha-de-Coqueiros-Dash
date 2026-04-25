import streamlit as st
import pandas as pd
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import networkx as nx
from itertools import combinations
from collections import Counter
import streamlit.components.v1 as components
import re
from google.api_core import exceptions as google_exceptions

# Bibliotecas de IA (Novo SDK do Gemini) e ML
from google import genai
from google.genai import types
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

ARQUIVO_JSON = 'noticias.json'
BASE_URL = 'https://folhadecoqueiros.com.br/noticias/'

# Lista oficial de categorias e tipos de evento usadas no projeto
CATEGORIAS_VALIDAS = [
    'Comunidade e Sociedade',
    'Infraestrutura e Mobilidade',
    'Educação',
    'Economia e Negócios',
    'Cultura, Eventos e Gastronomia',
    'Meio Ambiente',
    'Saúde e Bem-estar',
    'Segurança',
    'Política e Gestão Pública',
    'Obituário',
    'Esportes',
]

TIPOS_EVENTO_VALIDOS = [
    'Reuniões e Gestão Comunitária',
    'Feiras e Mercados',
    'Saúde e Meio Ambiente',
    'Artes, Cultura e Entretenimento',
    'Outros / Institucional',
    'Festas e Celebrações',
    'Esportes e Lazer',
    'Educação, Palestras e Oficinas',
]

# Schema padrão de uma notícia (usado para crawling e schema evolution)
SCHEMA_NOTICIA = {
    "ID": None,
    "Título": "",
    "Data": "",
    "URL": "",
    "Conteúdo": "",
    "Categorias": None,
    "Palavras-Chaves": None,
    "É Evento": False,
    "Tipo do Evento": None,
    "Data do Evento": None,
    "Data Fim Evento": None,
    "Local do Evento": None,
    "Horário do Evento": None,
    "É Pago": False,
    "Valor do Evento": None,
}


# --- INICIALIZAÇÃO DO CLIENTE GEMINI ---
try:
    API_KEY = st.secrets["GEMINI_API_KEY"]
    client = genai.Client(api_key=API_KEY)
    IA_CONFIGURADA = True
except (KeyError, FileNotFoundError):
    client = None
    IA_CONFIGURADA = False


# -----------------------------------------------------------------------------
# Helpers de IO e schema
# -----------------------------------------------------------------------------
def carregar_noticias():
    """Carrega o arquivo JSON e garante que cada item está com schema completo."""
    if not os.path.exists(ARQUIVO_JSON):
        return []
    with open(ARQUIVO_JSON, 'r', encoding='utf-8') as f:
        try:
            dados = json.load(f)
        except json.JSONDecodeError:
            return []
    # Garante schema completo + IDs sequenciais
    return _normalizar_dados(dados)


def _normalizar_dados(dados):
    """Garante que todos os itens possuem todas as chaves do schema e IDs únicos."""
    ids_existentes = {d.get('ID') for d in dados if isinstance(d.get('ID'), int)}
    proximo_id = (max(ids_existentes) + 1) if ids_existentes else 0
    for d in dados:
        for chave, default in SCHEMA_NOTICIA.items():
            if chave not in d:
                d[chave] = default
        if not isinstance(d.get('ID'), int):
            d['ID'] = proximo_id
            proximo_id += 1
    return dados


def salvar_noticias(dados):
    with open(ARQUIVO_JSON, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)


# -----------------------------------------------------------------------------
# CRAWLING
# -----------------------------------------------------------------------------
def extrair_dados_noticia(url, novo_id=None):
    """Faz scraping de uma notícia individual e devolve dict no schema padrão."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.content, 'html.parser')

        titulo_el = soup.find('h1', class_='elementor-heading-title')
        titulo = titulo_el.get_text(strip=True) if titulo_el else "Sem título"

        data_el = soup.find('span', class_='elementor-post-info__item--type-date')
        data = data_el.get_text(strip=True) if data_el else ""

        conteudo_el = soup.find('div', class_='elementor-widget-theme-post-content')
        conteudo = (conteudo_el.get_text(separator='\n', strip=True)
                    if conteudo_el else "")

        # Constrói item respeitando o schema oficial
        noticia = dict(SCHEMA_NOTICIA)
        noticia.update({
            "ID": novo_id,
            "Título": titulo,
            "Data": data,
            "URL": url,
            "Conteúdo": conteudo,
        })
        return noticia
    except Exception:
        return None


def buscar_links_noticias(limite=1000):
    links = []
    pagina = 1
    while len(links) < limite:
        url_paginacao = BASE_URL if pagina == 1 else f"{BASE_URL}page/{pagina}/"
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            response = requests.get(url_paginacao, headers=headers, timeout=15)
        except requests.RequestException:
            break
        if response.status_code != 200:
            break
        soup = BeautifulSoup(response.content, 'html.parser')
        artigos = soup.find_all('article')
        novos_links = []
        for art in artigos:
            link_el = art.find('a', href=True)
            if link_el and link_el['href'] not in links and link_el['href'] not in novos_links:
                novos_links.append(link_el['href'])
        if not novos_links:
            break
        links.extend(novos_links)
        pagina += 1
        time.sleep(0.5)
    return links[:limite]


def iniciar_crawling(limite=100):
    urls = buscar_links_noticias(limite)
    if not urls:
        st.warning("Nenhum link encontrado.")
        return

    dados_existentes = carregar_noticias()
    urls_existentes = {d["URL"] for d in dados_existentes if d.get("URL")}

    # Próximo ID disponível
    ids_existentes = [d['ID'] for d in dados_existentes if isinstance(d.get('ID'), int)]
    proximo_id = (max(ids_existentes) + 1) if ids_existentes else 0

    novos_dados = []
    barra = st.progress(0, text="Coletando notícias...")
    total = len(urls)

    for i, url in enumerate(urls):
        if url not in urls_existentes:
            dados = extrair_dados_noticia(url, novo_id=proximo_id)
            if dados:
                novos_dados.append(dados)
                proximo_id += 1
        barra.progress((i + 1) / total, text=f"Processando {i+1}/{total}")

    dados_finais = dados_existentes + novos_dados
    salvar_noticias(dados_finais)
    st.success(f"Crawling finalizado! {len(novos_dados)} novas notícias.")
    st.rerun()


# -----------------------------------------------------------------------------
# IA - Categorização e extração de metadados
# -----------------------------------------------------------------------------
def _construir_prompt_ia(noticia):
    """Monta prompt único com instruções detalhadas e categorias válidas."""
    cats = "\n".join(f"- {c}" for c in CATEGORIAS_VALIDAS)
    tipos = "\n".join(f"- {t}" for t in TIPOS_EVENTO_VALIDOS)
    return f"""
Você é um analista de jornalismo local. Analise a notícia abaixo da Folha de
Coqueiros (Florianópolis) e extraia metadados em JSON estrito.

Data de publicação: {noticia.get('Data', '')}
Título: {noticia.get('Título', '')}
Conteúdo:
{noticia.get('Conteúdo', '')[:6000]}

REGRAS:
- Datas no formato DD/MM/AAAA. Se for relativa ("próximo sábado", "dia 7"),
  calcule a data com base na data de publicação acima.
- Horário no formato HH:MM (24h).
- "É Evento" = true SOMENTE se a notícia divulga um evento agendado (palestra,
  feira, festa, reunião, show, etc.) com data identificável. Cobertura de
  acontecimentos passados, obituários e notícias factuais não são eventos.
- "É Pago" = true se houver cobrança de ingresso/convite/inscrição.
  Se for gratuito, "Valor do Evento" deve ser "R$0,00".

CAMPOS (use EXATAMENTE estes nomes em snake_case):
- categoria: uma das categorias abaixo (string). Escolha a mais adequada.
{cats}
- palavras_chave: 3 a 5 termos relevantes separados por vírgula (string).
- e_evento: boolean.
- tipo_evento: se e_evento=true, um dos tipos abaixo, senão null.
{tipos}
- data_evento: data início DD/MM/AAAA (string) ou null.
- data_fim_evento: data fim DD/MM/AAAA (string) ou null.
- local_evento: nome do local (string) ou null.
- horario_evento: HH:MM (string) ou null.
- e_pago: boolean.
- valor_evento: string formatada ex "R$45,00" se pago, "R$0,00" se gratuito,
  null se não for evento.

Retorne APENAS o JSON, sem texto adicional.
""".strip()


def _eh_pendente(d):
    """Item pendente de IA: sem categoria ou sem palavras-chave."""
    cat = d.get("Categorias")
    pal = d.get("Palavras-Chaves")
    cat_vazia = cat in (None, "", "Não categorizado")
    pal_vazia = pal in (None, "", "N/A")
    return cat_vazia or pal_vazia


def processar_ia(limite_ia):
    if not IA_CONFIGURADA:
        st.error("Configure a GEMINI_API_KEY em .streamlit/secrets.toml.")
        return
    dados = carregar_noticias()
    pendentes = [d for d in dados if _eh_pendente(d)][:limite_ia]
    if not pendentes:
        st.info("Nenhuma notícia pendente de classificação.")
        return

    barra = st.progress(0, text="Processando IA...")
    sucesso = 0

    for idx, noticia in enumerate(pendentes):
        prompt = _construir_prompt_ia(noticia)
        try:
            resp = client.models.generate_content(
                model='gemini-2.5-flash-lite',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            res = json.loads(resp.text)

            categoria = res.get('categoria')
            if categoria not in CATEGORIAS_VALIDAS:
                categoria = None
            tipo_evento = res.get('tipo_evento')
            if tipo_evento not in TIPOS_EVENTO_VALIDOS:
                tipo_evento = None

            e_evento = bool(res.get('e_evento')) if res.get('e_evento') is not None else False
            e_pago = bool(res.get('e_pago')) if res.get('e_pago') is not None else False

            atualizacao = {
                'Categorias': categoria,
                'Palavras-Chaves': res.get('palavras_chave'),
                'É Evento': e_evento,
                'Tipo do Evento': tipo_evento if e_evento else None,
                'Data do Evento': res.get('data_evento') if e_evento else None,
                'Data Fim Evento': res.get('data_fim_evento') if e_evento else None,
                'Local do Evento': res.get('local_evento') if e_evento else None,
                'Horário do Evento': res.get('horario_evento') if e_evento else None,
                'É Pago': e_pago if e_evento else False,
                'Valor do Evento': res.get('valor_evento') if e_evento else None,
            }
            noticia.update(atualizacao)
            sucesso += 1
        except Exception as exc:
            st.warning(f"Falha ao processar ID {noticia.get('ID')}: {exc}")
        barra.progress((idx + 1) / len(pendentes),
                       text=f"IA {idx+1}/{len(pendentes)}")
        time.sleep(4)  # rate limit conservador

    # Atualiza dados pelo ID
    pendentes_por_id = {p['ID']: p for p in pendentes}
    for i, d in enumerate(dados):
        if d.get('ID') in pendentes_por_id:
            dados[i] = pendentes_por_id[d['ID']]
    salvar_noticias(dados)
    st.success(f"IA finalizada. {sucesso}/{len(pendentes)} processadas.")
    st.rerun()


# -----------------------------------------------------------------------------
# Embeddings + Clusterização (opcional, exposto para análise futura)
# -----------------------------------------------------------------------------
def gerar_embeddings_e_clusters(noticias, k=None):
    """Gera embeddings com Gemini e devolve labels de cluster + coordenadas 2D."""
    if not IA_CONFIGURADA or not noticias:
        return None
    embeddings = []
    for d in noticias:
        try:
            res = client.models.embed_content(
                model='gemini-embedding-001',
                contents=d.get('Título', '') + '. ' + d.get('Conteúdo', '')[:1000],
            )
            embeddings.append(res.embeddings[0].values)
        except Exception:
            embeddings.append(None)
        time.sleep(0.3)
    embeddings_validos = [e for e in embeddings if e is not None]
    if not embeddings_validos:
        return None
    matriz = np.array(embeddings_validos)
    n = len(matriz)
    k_eff = k or min(max(2, int(np.sqrt(n))), 10)
    if n < k_eff:
        k_eff = max(2, n // 2)
    labels = KMeans(n_clusters=k_eff, n_init='auto', random_state=42).fit_predict(matriz)
    coords = PCA(n_components=2, random_state=42).fit_transform(matriz)
    sil = silhouette_score(matriz, labels) if n > k_eff else float('nan')
    return {
        'labels': labels.tolist(),
        'coords': coords.tolist(),
        'silhouette': sil,
        'k': k_eff,
    }


# -----------------------------------------------------------------------------
# Nuvem de palavras interativa (HTML/JS)
# -----------------------------------------------------------------------------
def renderizar_nuvem_interativa_html(freq_dict):
    data_js = [[k, v] for k, v in freq_dict.items()]
    html_content = f"""
    <script src="https://cdnjs.cloudflare.com/ajax/libs/wordcloud2.js/1.2.2/wordcloud2.min.js"></script>
    <div id="canvas-container" style="width: 100%; height: 450px; position: relative;">
        <canvas id="my_canvas" style="width: 100%; height: 100%;"></canvas>
        <div id="tooltip" style="position: absolute; display: none; background: #333; color: #fff; padding: 5px; border-radius: 5px; pointer-events: none; font-family: sans-serif; font-size: 13px;"></div>
    </div>
    <script>
        const entries = {data_js};
        const canvas = document.getElementById('my_canvas');
        const tooltip = document.getElementById('tooltip');
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = canvas.parentElement.offsetHeight;
        let maxF = Math.max(...entries.map(e => e[1]));
        let minF = Math.min(...entries.map(e => e[1]));
        WordCloud(canvas, {{
            list: entries,
            gridSize: 8,
            weightFactor: size => 14 + ((size - minF) / (maxF - minF || 1)) * 70,
            fontFamily: 'Segoe UI', color: 'random-dark', rotateRatio: 0.3,
            backgroundColor: 'transparent',
            hover: (item, dim, event) => {{
                if (item) {{
                    tooltip.style.display = 'block';
                    tooltip.style.left = event.pageX + 10 + 'px';
                    tooltip.style.top = event.pageY + 10 + 'px';
                    tooltip.innerHTML = item[0] + ': ' + item[1];
                }} else tooltip.style.display = 'none';
            }}
        }});
    </script>
    """
    return html_content


# -----------------------------------------------------------------------------
# Helpers de análise (Grafo de co-ocorrência)
# -----------------------------------------------------------------------------
def construir_grafo_cooccorrencia(df, coluna='Palavras-Chaves', top_n=30, min_peso=2):
    """Constrói grafo de co-ocorrência de palavras-chaves a partir do DF.

    Retorna (G, posicoes, contagem_termos).
    """
    todas = []
    listas_por_noticia = []
    for s in df[coluna].dropna():
        if not isinstance(s, str) or not s.strip():
            continue
        termos = [t.strip().title() for t in s.split(',') if t.strip()]
        listas_por_noticia.append(termos)
        todas.extend(termos)

    if not todas:
        return None, None, None

    contagem = Counter(todas)
    top = [t for t, _ in contagem.most_common(top_n)]
    top_set = set(top)

    co = Counter()
    for termos in listas_por_noticia:
        unicos = sorted(set(termos) & top_set)
        for a, b in combinations(unicos, 2):
            co[(a, b)] += 1

    G = nx.Graph()
    for t in top:
        G.add_node(t, size=contagem[t])
    for (a, b), w in co.items():
        if w >= min_peso:
            G.add_edge(a, b, weight=w)

    pos = nx.spring_layout(G, k=0.7, seed=42, iterations=80)
    return G, pos, contagem


def responder_chat(mensagens_historico, dataframe, metricas):
    """Chatbot RAG Otimizado: Gasta menos tokens e lida com erros de Cota (429) do nível Gratuito."""
    if not IA_CONFIGURADA:
        return "⚠️ Erro: API Key não configurada."

    pergunta_usuario = mensagens_historico[-1]["content"]
    palavras = re.sub(r'[^\w\s]', '', pergunta_usuario).split()
    
    # Ignora palavras comuns
    stopwords_busca = {"quais", "quantas", "quantos", "sobre", "noticias", "notícias", "citam", "falam", "tem", "que", "para", "como", "qual", "onde", "sobre", "das", "dos"}
    termos_busca = [p for p in palavras if len(p) > 3 and p.lower() not in stopwords_busca]
    
    relatorio_busca = "🔍 RESULTADO DA BUSCA INTERNA NO BANCO DE DADOS:\n"
    noticias_relevantes = [] # Vai guardar APENAS as notícias que importam
    
    # 1. BUSCA INTELIGENTE (PANDAS)
    for termo in termos_busca:
        mask = dataframe['Conteúdo'].str.contains(termo, case=False, na=False) | \
               dataframe['Título'].str.contains(termo, case=False, na=False) | \
               dataframe['Palavras-Chaves'].str.contains(termo, case=False, na=False)
        df_busca = dataframe[mask]
        
        if len(df_busca) > 0:
            relatorio_busca += f"- O termo '{termo}' aparece em EXATAMENTE {len(df_busca)} notícias.\n"
            # Pegamos no máximo 15 notícias por termo para não estourar a cota de 250k tokens do Free Tier
            noticias_relevantes.append(df_busca.head(15))

    # 2. MONTA UM CONTEXTO ENXUTO (Economia drástica de tokens)
    if noticias_relevantes:
        # Junta todas as notícias encontradas, remove duplicatas e gera o JSON
        df_contexto = pd.concat(noticias_relevantes).drop_duplicates(subset=['URL'])
        # Enviamos apenas colunas essenciais para responder à pergunta
        colunas_uteis = [c for c in ['Título', 'Data', 'URL', 'Conteúdo', 'Categorias', 'É Evento', 'Local do Evento'] if c in df_contexto.columns]
        contexto_noticias = df_contexto[colunas_uteis].to_json(orient='records', force_ascii=False)
    else:
        contexto_noticias = "Nenhuma notícia específica encontrada para os termos buscados. Responda apenas com base nas Estatísticas Gerais."

    # 3. PROMPT DO SISTEMA
    instrucao_sistema = f"""
    Você é o Consultor Editorial Sênior da Folha de Coqueiros. 
    
    ESTATÍSTICAS CONSOLIDADAS:
    {metricas}

    {relatorio_busca}

    NOTÍCIAS FILTRADAS (Apenas conteúdo relevante para a pergunta atual):
    {contexto_noticias}

    DIRETRIZES DE RESPOSTA:
    1. CITAÇÕES RÍGIDAS: Cite as notícias usando OBRIGATORIAMENTE o formato Markdown: [Título da Notícia](URL).
    2. ECONOMIA DE TEXTO: Seja direto. Se o usuário perguntar quantidades, confie no RESULTADO DA BUSCA INTERNA.
    3. INFORMAÇÃO GERAL: Se perguntarem algo genérico (ex: total de notícias), use as ESTATÍSTICAS CONSOLIDADAS.
    """

    conteudo_formatado = [
        types.Content(role="model" if msg["role"] == "assistant" else "user", 
                      parts=[types.Part.from_text(text=msg["content"])])
        for msg in mensagens_historico
    ]

    # 4. AMORTECEDOR DE ERRO (Retry/Backoff)
    tentativas = 0
    max_tentativas = 3
    
    while tentativas < max_tentativas:
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash-lite',
                contents=conteudo_formatado,
                config=types.GenerateContentConfig(
                    system_instruction=instrucao_sistema,
                    temperature=0.2 
                )
            )
            return response.text
        
        except Exception as e:
            erro_str = str(e)
            if "429" in erro_str or "RESOURCE_EXHAUSTED" in erro_str:
                tentativas += 1
                tempo_espera = 25 # Se der o erro, o código trava por 25 segundos e tenta sozinho de novo
                print(f"Cota excedida. Aguardando {tempo_espera}s (Tentativa {tentativas}/{max_tentativas})...")
                time.sleep(tempo_espera)
            else:
                # Se for outro tipo de erro (sem internet, erro interno), retorna o erro
                return f"❌ Erro na comunicação com a IA: {erro_str}"
                
    return "❌ Falha após 3 tentativas: A cota gratuita da API do Google está esgotada para este minuto. Aguarde 1 minuto e pergunte novamente."