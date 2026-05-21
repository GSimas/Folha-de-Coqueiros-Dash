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
from pyvis.network import Network

ARQUIVO_JSON = "noticias.json"
BASE_URL = "https://folhadecoqueiros.com.br/noticias/"

PROMPT_ATORES = """
Analise a notícia abaixo e extraia uma lista de 'Atores' (entidades mencionadas).
Notícia: {conteudo}

Para cada ator, identifique:
1. Nome (Nome próprio, sem cargos antes do nome).
2. Tipo (Escolha entre: Pessoa, Organização, Local, Empresa).
3. Breve descrição/papel na notícia.

Retorne APENAS um JSON no formato:
{{"atores": [
    {{"nome": "Nome", "tipo": "Tipo", "descricao": "Papel"}},
    ...
]}}
"""

# Lista oficial de categorias e tipos de evento usadas no projeto
CATEGORIAS_VALIDAS = [
    "Comunidade e Sociedade",
    "Infraestrutura e Mobilidade",
    "Educação",
    "Economia e Negócios",
    "Cultura, Eventos e Gastronomia",
    "Meio Ambiente",
    "Saúde e Bem-estar",
    "Segurança",
    "Política e Gestão Pública",
    "Obituário",
    "Esportes",
]

TIPOS_EVENTO_VALIDOS = [
    "Reuniões e Gestão Comunitária",
    "Feiras e Mercados",
    "Saúde e Meio Ambiente",
    "Artes, Cultura e Entretenimento",
    "Outros / Institucional",
    "Festas e Celebrações",
    "Esportes e Lazer",
    "Educação, Palestras e Oficinas",
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


def obter_tabela_atores_com_sna():
    """Gera o DataFrame completo de Atores com métricas matemáticas de SNA."""
    ARQUIVO_ATORES = "atores.json"

    if not os.path.exists(ARQUIVO_ATORES):
        return pd.DataFrame()

    with open(ARQUIVO_ATORES, "r", encoding="utf-8") as f:
        atores = json.load(f)

    if not atores:
        return pd.DataFrame()

    # 1. Constrói o Grafo Global (Todos os atores)
    G = nx.Graph()
    for ator in atores:
        G.add_node(ator["Nome"])

    for i in range(len(atores)):
        for j in range(i + 1, len(atores)):
            noticias_comuns = set(atores[i].get("Noticias", [])).intersection(
                set(atores[j].get("Noticias", []))
            )
            if len(noticias_comuns) > 0:
                # O peso é a quantidade de notícias que compartilham
                G.add_edge(
                    atores[i]["Nome"], atores[j]["Nome"], weight=len(noticias_comuns)
                )

    # 2. Calcula as Métricas de SNA
    grau_absoluto = dict(G.degree())
    degree_cent = nx.degree_centrality(G)
    # Betweenness (Intermediação): Atores que servem de "ponte" entre grupos isolados
    betweenness = nx.betweenness_centrality(G, weight=None)
    # Closeness (Proximidade): Quão perto o ator está de todos os outros da rede
    closeness = nx.closeness_centrality(G)

    # 3. Monta os dados para a Tabela
    dados_tabela = []
    for ator in atores:
        nome = ator["Nome"]
        dados_tabela.append(
            {
                "ID_Ator": ator.get("ID_Ator", ""),
                "Nome": nome,
                "Tipo": ator.get("Tipo", ""),
                "Descrição": ator.get("Descricao", ""),
                "Citações (Qtd)": len(ator.get("Noticias", [])),
                "Notícias (IDs)": ", ".join(map(str, ator.get("Noticias", []))),
                "Grau Absoluto": grau_absoluto.get(nome, 0),
                "Centralidade de Grau": round(degree_cent.get(nome, 0.0), 4),
                "Betweenness": round(betweenness.get(nome, 0.0), 4),
                "Closeness": round(closeness.get(nome, 0.0), 4),
            }
        )

    return pd.DataFrame(dados_tabela)


def construir_grafo_atores(top_n=30, min_peso=1):
    """Lê o atores.json e constrói o grafo de coocorrência de atores com SNA."""
    ARQUIVO_ATORES = "atores.json"

    if not os.path.exists(ARQUIVO_ATORES):
        return None, None

    with open(ARQUIVO_ATORES, "r", encoding="utf-8") as f:
        atores = json.load(f)

    if not atores:
        return None, None

    atores_top = sorted(atores, key=lambda x: len(x.get("Noticias", [])), reverse=True)[
        :top_n
    ]
    G = nx.Graph()

    for ator in atores_top:
        G.add_node(
            ator["Nome"],
            size_data=len(ator["Noticias"]),
            tipo=ator.get("Tipo", "Desconhecido"),
            descricao=ator.get("Descricao", "Sem descrição"),
            noticias_ids=", ".join(map(str, ator.get("Noticias", []))),
        )

    for i in range(len(atores_top)):
        for j in range(i + 1, len(atores_top)):
            ator_a = atores_top[i]
            ator_b = atores_top[j]
            noticias_comuns = set(ator_a["Noticias"]).intersection(
                set(ator_b["Noticias"])
            )
            if len(noticias_comuns) >= min_peso:
                G.add_edge(ator_a["Nome"], ator_b["Nome"], weight=len(noticias_comuns))

    if len(G.nodes) == 0:
        return None, None

    # Calcula métricas SNA globais para este recorte
    betweenness = nx.betweenness_centrality(G, weight=None)
    closeness = nx.closeness_centrality(G)

    for n in G.nodes():
        G.nodes[n]["SNA_Grau"] = G.degree[n]
        G.nodes[n]["SNA_Betweenness"] = round(betweenness[n], 4)
        G.nodes[n]["SNA_Closeness"] = round(closeness[n], 4)

    return G, None


def sincronizar_atores(novos_atores_extraidos, id_noticia):
    ARQUIVO_ATORES = "atores.json"

    # 1. Carrega base atual
    if os.path.exists(ARQUIVO_ATORES):
        with open(ARQUIVO_ATORES, "r", encoding="utf-8") as f:
            base_atores = json.load(f)
    else:
        base_atores = []

    for novo in novos_atores_extraidos:
        nome_novo = novo["nome"].strip().title()  # Normalização básica
        tipo_novo = novo["tipo"]

        # 2. Verifica se já existe (mesmo nome e tipo)
        ator_existente = next(
            (
                a
                for a in base_atores
                if a["Nome"] == nome_novo and a["Tipo"] == tipo_novo
            ),
            None,
        )

        if ator_existente:
            # Se já existe, apenas adiciona o ID da notícia na lista (se não estiver lá)
            if id_noticia not in ator_existente["Noticias"]:
                ator_existente["Noticias"].append(id_noticia)
        else:
            # 3. Se não existe, cria novo ID e adiciona à base
            novo_id = max([a["ID_Ator"] for a in base_atores]) + 1 if base_atores else 0
            base_atores.append(
                {
                    "ID_Ator": novo_id,
                    "Nome": nome_novo,
                    "Tipo": tipo_novo,
                    "Descricao": novo["descricao"],
                    "Noticias": [id_noticia],
                }
            )

    # 4. Salva a base atualizada
    with open(ARQUIVO_ATORES, "w", encoding="utf-8") as f:
        json.dump(base_atores, f, ensure_ascii=False, indent=4)


# -----------------------------------------------------------------------------
# Helpers de IO e schema
# -----------------------------------------------------------------------------
def carregar_noticias():
    """Carrega o arquivo JSON e garante que cada item está com schema completo."""
    if not os.path.exists(ARQUIVO_JSON):
        return []
    with open(ARQUIVO_JSON, "r", encoding="utf-8") as f:
        try:
            dados = json.load(f)
        except json.JSONDecodeError:
            return []
    # Garante schema completo + IDs sequenciais
    return _normalizar_dados(dados)


def _normalizar_dados(dados):
    """Garante que todos os itens possuem todas as chaves do schema e IDs únicos."""
    ids_existentes = {d.get("ID") for d in dados if isinstance(d.get("ID"), int)}
    proximo_id = (max(ids_existentes) + 1) if ids_existentes else 0
    for d in dados:
        for chave, default in SCHEMA_NOTICIA.items():
            if chave not in d:
                d[chave] = default
        if not isinstance(d.get("ID"), int):
            d["ID"] = proximo_id
            proximo_id += 1
    return dados


def salvar_noticias(dados):
    with open(ARQUIVO_JSON, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)


# -----------------------------------------------------------------------------
# CRAWLING
# -----------------------------------------------------------------------------
def extrair_dados_noticia(url, novo_id=None):
    """Faz scraping de uma notícia individual e devolve dict no schema padrão."""
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.content, "html.parser")

        titulo_el = soup.find("h1", class_="elementor-heading-title")
        titulo = titulo_el.get_text(strip=True) if titulo_el else "Sem título"

        data_el = soup.find("span", class_="elementor-post-info__item--type-date")
        data = data_el.get_text(strip=True) if data_el else ""

        conteudo_el = soup.find("div", class_="elementor-widget-theme-post-content")
        conteudo = (
            conteudo_el.get_text(separator="\n", strip=True) if conteudo_el else ""
        )

        # Constrói item respeitando o schema oficial
        noticia = dict(SCHEMA_NOTICIA)
        noticia.update(
            {
                "ID": novo_id,
                "Título": titulo,
                "Data": data,
                "URL": url,
                "Conteúdo": conteudo,
            }
        )
        return noticia
    except Exception:
        return None


def buscar_links_noticias(limite=1000):
    links = []
    pagina = 1
    while len(links) < limite:
        url_paginacao = BASE_URL if pagina == 1 else f"{BASE_URL}page/{pagina}/"
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            response = requests.get(url_paginacao, headers=headers, timeout=15)
        except requests.RequestException:
            break
        if response.status_code != 200:
            break
        soup = BeautifulSoup(response.content, "html.parser")
        artigos = soup.find_all("article")
        novos_links = []
        for art in artigos:
            link_el = art.find("a", href=True)
            if (
                link_el
                and link_el["href"] not in links
                and link_el["href"] not in novos_links
            ):
                novos_links.append(link_el["href"])
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
    ids_existentes = [d["ID"] for d in dados_existentes if isinstance(d.get("ID"), int)]
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
        barra.progress((i + 1) / total, text=f"Processando {i + 1}/{total}")

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

Data de publicação: {noticia.get("Data", "")}
Título: {noticia.get("Título", "")}
Conteúdo:
{noticia.get("Conteúdo", "")[:6000]}

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
            # ==========================================================
            # ETAPA 1: CLASSIFICAÇÃO E METADADOS DA NOTÍCIA
            # ==========================================================
            resp = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            res = json.loads(resp.text)

            categoria = res.get("categoria")
            if categoria not in CATEGORIAS_VALIDAS:
                categoria = None
            tipo_evento = res.get("tipo_evento")
            if tipo_evento not in TIPOS_EVENTO_VALIDOS:
                tipo_evento = None

            e_evento = (
                bool(res.get("e_evento")) if res.get("e_evento") is not None else False
            )
            e_pago = bool(res.get("e_pago")) if res.get("e_pago") is not None else False

            atualizacao = {
                "Categorias": categoria,
                "Palavras-Chaves": res.get("palavras_chave"),
                "É Evento": e_evento,
                "Tipo do Evento": tipo_evento if e_evento else None,
                "Data do Evento": res.get("data_evento") if e_evento else None,
                "Data Fim Evento": res.get("data_fim_evento") if e_evento else None,
                "Local do Evento": res.get("local_evento") if e_evento else None,
                "Horário do Evento": res.get("horario_evento") if e_evento else None,
                "É Pago": e_pago if e_evento else False,
                "Valor do Evento": res.get("valor_evento") if e_evento else None,
            }
            noticia.update(atualizacao)

            # ==========================================================
            # ETAPA 2: EXTRAÇÃO DE ATORES E SINCRONIZAÇÃO (NOVO)
            # ==========================================================
            # Formata o prompt com o conteúdo truncado (segurança para não estourar tokens)
            prompt_entidades = PROMPT_ATORES.format(
                conteudo=noticia.get("Conteúdo", "")[:6000]
            )

            res_ia_atores = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=prompt_entidades,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", temperature=0.1
                ),
            )

            # Limpeza de segurança caso a IA devolva aspas de markdown
            texto_limpo_atores = (
                res_ia_atores.text.replace("```json", "").replace("```", "").strip()
            )
            atores_json = json.loads(texto_limpo_atores)

            if "atores" in atores_json:
                sincronizar_atores(atores_json["atores"], noticia.get("ID"))

            # Incrementa sucesso apenas se ambas as etapas passarem
            sucesso += 1

        except Exception as exc:
            st.warning(f"Falha ao processar ID {noticia.get('ID')}: {exc}")

        barra.progress(
            (idx + 1) / len(pendentes), text=f"IA {idx + 1}/{len(pendentes)}"
        )
        time.sleep(4)  # rate limit conservador

    # Atualiza dados pelo ID
    pendentes_por_id = {p["ID"]: p for p in pendentes}
    for i, d in enumerate(dados):
        if d.get("ID") in pendentes_por_id:
            dados[i] = pendentes_por_id[d["ID"]]

    salvar_noticias(dados)
    st.success(
        f"IA finalizada. {sucesso}/{len(pendentes)} processadas e atores sincronizados."
    )
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
                model="gemini-embedding-001",
                contents=d.get("Título", "") + ". " + d.get("Conteúdo", "")[:1000],
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
    labels = KMeans(n_clusters=k_eff, n_init="auto", random_state=42).fit_predict(
        matriz
    )
    coords = PCA(n_components=2, random_state=42).fit_transform(matriz)
    sil = silhouette_score(matriz, labels) if n > k_eff else float("nan")
    return {
        "labels": labels.tolist(),
        "coords": coords.tolist(),
        "silhouette": sil,
        "k": k_eff,
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
def construir_grafo_cooccorrencia(df, coluna="Palavras-Chaves", top_n=30, min_peso=2):
    """Constrói grafo de co-ocorrência de palavras-chaves a partir do DF.

    Retorna (G, posicoes, contagem_termos).
    """
    todas = []
    listas_por_noticia = []
    for s in df[coluna].dropna():
        if not isinstance(s, str) or not s.strip():
            continue
        termos = [t.strip().title() for t in s.split(",") if t.strip()]
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
        G.add_node(t, size_data=contagem[t])
    for (a, b), w in co.items():
        if w >= min_peso:
            G.add_edge(a, b, weight=w)

    pos = nx.spring_layout(G, k=0.7, seed=42, iterations=80)
    return G, pos, contagem


def responder_chat(
    mensagens_historico,
    dataframe_noticias,
    dataframe_atores,
    metricas,
    modelo_escolhido="gemini-3.1-flash-lite",
):
    """Chatbot RAG: Agora com contexto completo de Notícias e Rede de Atores (SNA)."""
    if not IA_CONFIGURADA:
        return "⚠️ Erro: API Key não configurada."

    pergunta_usuario = mensagens_historico[-1]["content"]

    # Limpeza básica para busca
    palavras = re.sub(r"[^\w\s]", "", pergunta_usuario).split()
    stopwords_busca = {
        "quais",
        "quantas",
        "quantos",
        "sobre",
        "noticias",
        "notícias",
        "citam",
        "falam",
        "tem",
        "que",
        "para",
        "como",
        "qual",
        "onde",
        "sobre",
        "das",
        "dos",
        "quem",
        "é",
        "o",
        "a",
    }
    termos_busca = [
        p for p in palavras if len(p) > 2 and p.lower() not in stopwords_busca
    ]

    relatorio_busca = "🔍 RESULTADO DA BUSCA INTERNA:\n"
    contexto_noticias = ""
    contexto_atores = ""

    # 1. BUSCA NOS ATORES (Entidades e Métricas SNA)
    atores_encontrados = []
    if not dataframe_atores.empty:
        for termo in termos_busca:
            mask_atores = dataframe_atores["Nome"].str.contains(
                termo, case=False, na=False
            ) | dataframe_atores["Descrição"].str.contains(termo, case=False, na=False)
            df_atores_filtro = dataframe_atores[mask_atores]
            if not df_atores_filtro.empty:
                atores_encontrados.append(df_atores_filtro)

        if atores_encontrados:
            df_atores_contexto = (
                pd.concat(atores_encontrados).drop_duplicates(subset=["Nome"]).head(10)
            )
            contexto_atores = df_atores_contexto.to_json(
                orient="records", force_ascii=False
            )
            relatorio_busca += f"- Encontrados {len(df_atores_contexto)} atores relevantes para a consulta.\n"

    # 2. BUSCA NAS NOTÍCIAS
    noticias_relevantes = []
    for termo in termos_busca:
        mask_noticias = dataframe_noticias["Conteúdo"].str.contains(
            termo, case=False, na=False
        ) | dataframe_noticias["Título"].str.contains(termo, case=False, na=False)
        df_noticias_filtro = dataframe_noticias[mask_noticias]
        if not df_noticias_filtro.empty:
            noticias_relevantes.append(df_noticias_filtro.head(10))

    if noticias_relevantes:
        df_noticias_contexto = (
            pd.concat(noticias_relevantes).drop_duplicates(subset=["URL"]).head(15)
        )
        contexto_noticias = df_noticias_contexto[
            ["Título", "Data", "URL", "Categorias", "Conteúdo"]
        ].to_json(orient="records", force_ascii=False)
        relatorio_busca += (
            f"- Encontradas {len(df_noticias_contexto)} notícias relacionadas.\n"
        )

    # 3. PROMPT DO SISTEMA ENRIQUECIDO
    instrucao_sistema = f"""
    Você é o Consultor Editorial e Analista de Redes da Folha de Coqueiros.
    
    CONTEXTO DE REDE (ATORES):
    {contexto_atores if contexto_atores else "Nenhum ator específico identificado na busca inicial."}

    ESTATÍSTICAS GERAIS:
    {metricas}

    NOTÍCIAS FILTRADAS:
    {contexto_noticias if contexto_noticias else "Nenhuma notícia específica encontrada."}

    DIRETRIZES:
    1. Se perguntarem sobre pessoas, empresas ou órgãos, use os dados de SNA (Centralidade, Betweenness) para explicar a importância deles no bairro.
    2. Cite atores e notícias de forma natural. Se citar uma notícia, use: [Título](URL).
    3. Seja preciso sobre quem é quem, usando as descrições dos atores.
    """

    conteudo_formatado = [
        types.Content(
            role="model" if msg["role"] == "assistant" else "user",
            parts=[types.Part.from_text(text=msg["content"])],
        )
        for msg in mensagens_historico
    ]

    # 4. EXECUÇÃO COM RETRY
    tentativas = 0
    max_tentativas = 3

    while tentativas < max_tentativas:
        try:
            response = client.models.generate_content(
                model=modelo_escolhido,  # <-- AQUI ESTÁ A MUDANÇA: Usa o modelo selecionado pelo usuário
                contents=conteudo_formatado,
                config=types.GenerateContentConfig(
                    system_instruction=instrucao_sistema, temperature=0.2
                ),
            )
            return response.text

        except Exception as e:
            erro_str = str(e)
            if "429" in erro_str or "503" in erro_str or "UNAVAILABLE" in erro_str:
                tentativas += 1
                if tentativas < max_tentativas:
                    print(
                        f"Servidor do Google ocupado. Aguardando 20s... (Tentativa {tentativas}/{max_tentativas})"
                    )
                    time.sleep(20)
            else:
                return f"❌ Erro crítico de comunicação: {erro_str}"

    return "❌ Os servidores da IA estão superlotados no momento. Por favor, aguarde uns 30 segundos e envie sua pergunta novamente."
