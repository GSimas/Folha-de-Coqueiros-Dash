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

# Funções utilitárias
from utils import (
    extrair_dados_noticia, buscar_links_noticias, iniciar_crawling,
    processar_ia, renderizar_nuvem_interativa_html,
    carregar_noticias, construir_grafo_cooccorrencia,
    ARQUIVO_JSON, IA_CONFIGURADA, SCHEMA_NOTICIA,
    CATEGORIAS_VALIDAS, TIPOS_EVENTO_VALIDOS,
    responder_chat
)

st.set_page_config(page_title="Dashboard Folha de Coqueiros", layout="wide")

st.title("🗞️ Dashboard Analítico e IA - Folha de Coqueiros")

# --- BARRA LATERAL ---
with st.sidebar:
    # 1. Exibição da Logo
    if os.path.exists("folhadecoqueiros-logo.jpg"):
        st.image("folhadecoqueiros-logo.jpg", use_container_width=True)
    else:
        st.warning("⚠️ Arquivo 'folhadecoqueiros-logo.jpg' não encontrado na pasta.")
        
    st.divider()
    
    # 2. Descritivo do Projeto
    st.markdown("""
    ### Sobre o Painel
    Este dashboard analítico processa o acervo histórico do jornal local, aplicando Processamento de Linguagem Natural (NLP) e modelos de linguagem generativa. 
    
    O objetivo é extrair metadados, mapear redes semânticas e revelar o panorama editorial, social e de infraestrutura da comunidade por meio de dados.
    """)
    
    st.divider()

    # Ícones em SVG para evitar dependência de CDNs externos que o Streamlit pode bloquear
    icon_github = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>'
    icon_linkedin = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077b5"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.238 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>'
    icon_instagram = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#E1306C"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>'

    creditos_html = f"""
    <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px; padding: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
        <span style="font-size: 14px; opacity: 0.8;">Desenvolvido por <b>Gustavo Simas</b></span>
        <a href="https://github.com/GSimas" target="_blank" style="text-decoration: none; color: inherit;">{icon_github}</a>
        <a href="https://www.linkedin.com/in/simasgs/" target="_blank" style="text-decoration: none;">{icon_linkedin}</a>
        <a href="https://instagram.com/tudoemsimas" target="_blank" style="text-decoration: none;">{icon_instagram}</a>
    </div>
    """

    # Usar st.sidebar.markdown com unsafe_allow_html=True garante que o div seja interpretado corretamente
    st.sidebar.markdown(creditos_html, unsafe_allow_html=True)

# --- CORPO PRINCIPAL ----------------------------------------------------------
if not os.path.exists(ARQUIVO_JSON):
    st.info("Nenhum dado encontrado. Inicie o Crawling na barra lateral.")
    st.stop()

# Carrega dados já normalizados (schema completo + IDs sequenciais)
dados = carregar_noticias()
if not dados:
    st.warning("Arquivo de notícias vazio ou inválido.")
    st.stop()

df = pd.DataFrame(dados)

# Schema evolution / saneamento de tipos
for chave, default in SCHEMA_NOTICIA.items():
    if chave not in df.columns:
        df[chave] = default

# Tipos booleanos consistentes
df['É Evento'] = df['É Evento'].fillna(False).astype(bool)
df['É Pago'] = df['É Pago'].fillna(False).astype(bool)

# Conversões temporais
df['Data_Convertida'] = pd.to_datetime(df['Data'], format='%d/%m/%Y', errors='coerce')
df['Mes_Ano'] = df['Data_Convertida'].dt.to_period('M').astype(str)
df['Tamanho_Texto'] = df['Conteúdo'].fillna('').apply(lambda x: len(str(x).split()))

# Helpers para "categorizado" considerando null e legados
def _eh_categorizado(v):
    return isinstance(v, str) and v.strip() not in ('', 'Não categorizado')


def _tem_palavras(v):
    return isinstance(v, str) and v.strip() not in ('', 'N/A')


df['_Categorizado'] = df['Categorias'].apply(_eh_categorizado)
df['_TemPalavras'] = df['Palavras-Chaves'].apply(_tem_palavras)


# ------------------------------ MÉTRICAS GERAIS -------------------------------
st.subheader("📈 Estatísticas Gerais")
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Total de Notícias", len(df))
c2.metric("Média de Palavras", int(df['Tamanho_Texto'].mean()) if len(df) else 0)
c3.metric("Categorizadas", f"{df['_Categorizado'].sum()}/{len(df)}")
c4.metric("Eventos", int(df['É Evento'].sum()))
c5.metric("Eventos Pagos", int(df['É Pago'].sum()))

st.divider()

# ------------------------------ FILTROS ---------------------------------------
st.subheader("🤖 Análise Semântica e Volume")
df_v = df.dropna(subset=['Data_Convertida'])
if df_v.empty:
    st.warning("Nenhuma data válida nas notícias.")
    st.stop()

col_d1, col_d2 = st.columns([1, 1])
with col_d1:
    d_ini = st.date_input(
        "Início:", df_v['Data_Convertida'].min(), format="DD/MM/YYYY"
    )
with col_d2:
    d_fim = st.date_input(
        "Fim:", df_v['Data_Convertida'].max(), format="DD/MM/YYYY"
    )

df_f = df[(df['Data_Convertida'].dt.date >= d_ini) &
          (df['Data_Convertida'].dt.date <= d_fim)]

if df_f.empty:
    st.warning("Sem notícias no período selecionado.")
    st.stop()

# ------------------------------ GRÁFICOS BÁSICOS ------------------------------
col_n1, col_n2 = st.columns(2)
with col_n1:
    st.markdown("**Categorias no Período**")
    df_cat = df_f[df_f['_Categorizado']]
    if not df_cat.empty:
        fig = px.pie(df_cat, names='Categorias', hole=0.4)
        fig.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Nenhuma notícia categorizada no período.")

with col_n2:
        st.markdown("**Volume Temporal (mensal)**")
            
        # Adiciona o botão de opção (toggle)
        visao_volume = st.radio("Visão do Gráfico:", ["Geral", "Por Categoria"], horizontal=True)
            
        if visao_volume == "Geral":
            df_tempo = df_f.groupby('Mes_Ano').size().reset_index(name='Qtd')
            fig2 = px.bar(df_tempo, x='Mes_Ano', y='Qtd', color_discrete_sequence=['#1A5276'])
        else:
            df_tempo = df_f.groupby(['Mes_Ano', 'Categorias']).size().reset_index(name='Qtd')
            fig2 = px.bar(df_tempo, x='Mes_Ano', y='Qtd', color='Categorias')
                
        fig2.update_layout(xaxis_title="Mês/Ano", yaxis_title="Nº de Artigos")
        st.plotly_chart(fig2, use_container_width=True)

# ------------------------------ NUVEM DE PALAVRAS -----------------------------
st.markdown("**Nuvem de Palavras Interativa**")
stopwords = {
    "o", "a", "de", "que", "do", "da", "em", "um", "para", "é", "com", "não",
    "uma", "os", "no", "se", "na", "as", "por", "dos", "mais", "este", "fazer",
    "nesta", "também", "sobre", "como", "ao", "às", "à", "foi", "ser", "está",
    "estão", "são", "neste", "ainda", "mesmo", "muito", "todos", "todas",
    "entre", "esta", "essa", "esse", "isso", "aqui", "tem", "ter", "vai",
    "vão", "ele", "ela", "eles", "elas", "seu", "sua", "seus", "suas",
    "pela", "pelo", "pelas", "pelos", "será", "serão", "já", "lá", "nos",
}
texto = re.sub(r'[^\w\s]', '', " ".join(df_f['Conteúdo'].fillna('')).lower())
palavras = [p for p in texto.split() if p not in stopwords and len(p) > 3]
if palavras:
    html = renderizar_nuvem_interativa_html(
        dict(Counter(palavras).most_common(100))
    )
    components.html(html, height=480)

st.divider()

# ------------------------------ EVENTOS ---------------------------------------
st.subheader("📅 Eventos no Período")
df_eventos = df_f[df_f['É Evento']].copy()
if not df_eventos.empty:
    col_e1, col_e2 = st.columns(2)
    with col_e1:
        st.markdown("**Tipos de Evento**")
        df_tipo = df_eventos[df_eventos['Tipo do Evento'].notna()]
        if not df_tipo.empty:
            fig_t = px.pie(df_tipo, names='Tipo do Evento', hole=0.4)
            fig_t.update_traces(textposition='inside', textinfo='percent+label')
            st.plotly_chart(fig_t, use_container_width=True)
    with col_e2:
        st.markdown("**Eventos Pagos vs Gratuitos**")
        df_pago = df_eventos.assign(
            Custo=lambda d: d['É Pago'].map({True: 'Pago', False: 'Gratuito'})
        )
        fig_p = px.histogram(df_pago, x='Tipo do Evento', color='Custo',
                             barmode='group')
        fig_p.update_layout(xaxis_title="", yaxis_title="Qtd. eventos")
        st.plotly_chart(fig_p, use_container_width=True)

    cols_evt = ['ID', 'Título', 'Data do Evento', 'Data Fim Evento',
                'Tipo do Evento', 'Local do Evento', 'Horário do Evento',
                'É Pago', 'Valor do Evento', 'URL']
    cols_evt = [c for c in cols_evt if c in df_eventos.columns]
    st.dataframe(
        df_eventos[cols_evt].sort_values('Data do Evento'),
        use_container_width=True,
        column_config={
            "URL": st.column_config.LinkColumn("Link"),
            "É Pago": st.column_config.CheckboxColumn("Pago?"),
        },
        hide_index=True,
    )
else:
    st.info("Nenhum evento identificado no período.")

st.divider()

# ------------------------------ GRAFO DE PALAVRAS-CHAVE -----------------------
st.subheader("🕸️ Rede de Palavras-Chave")
df_g = df_f[df_f['_TemPalavras']]
if not df_g.empty:
    col_g1, col_g2 = st.columns([1, 3])
    with col_g1:
        nos = st.slider("Top termos:", 10, 100, 30)
        peso_min = st.slider("Co-ocorrência mínima:", 1, 10, 2)
    with col_g2:
        G, pos, contagem = construir_grafo_cooccorrencia(
            df_g, coluna='Palavras-Chaves', top_n=nos, min_peso=peso_min
        )
        if G is None or G.number_of_nodes() == 0:
            st.info("Não há palavras-chave suficientes para gerar o grafo.")
        else:
            # --- DESENHO DINÂMICO DAS ARESTAS (LINHAS) ---
            traces = []
            max_peso = max([d['weight'] for u, v, d in G.edges(data=True)]) if G.edges else 1

            for u, v, d in G.edges(data=True):
                x0, y0 = pos[u]
                x1, y1 = pos[v]
                peso_aresta = d['weight']
                
                # Cálculo para a espessura variar entre 0.5px e 5px
                espessura = (peso_aresta / max_peso) * 4.5 + 0.5
                
                traces.append(go.Scatter(
                    x=[x0, x1, None], 
                    y=[y0, y1, None],
                    line=dict(width=espessura, color='rgba(150, 170, 190, 0.5)'),
                    hoverinfo='none',
                    mode='lines'
                ))
            node_x = [pos[n][0] for n in G.nodes()]
            node_y = [pos[n][1] for n in G.nodes()]
            sizes = [G.nodes[n]['size'] for n in G.nodes()]
            max_size = max(sizes) if sizes else 1
            sizes_norm = [12 + (s / max_size) * 35 for s in sizes]
            labels = [f"{n} ({G.nodes[n]['size']})" for n in G.nodes()]

            node_trace = go.Scatter(
                x=node_x, y=node_y, mode='markers+text',
                text=list(G.nodes()), textposition='top center',
                textfont=dict(size=10),
                hovertext=labels, hoverinfo='text',
                marker=dict(
                    size=sizes_norm, color=sizes,
                    colorscale='Viridis', showscale=True,
                    colorbar=dict(title='Frequência'),
                    line=dict(width=1, color='white'),
                ),
            )
            traces.append(node_trace)
            fig_g = go.Figure(data=traces)
            fig_g.update_layout(
                showlegend=False,
                xaxis=dict(showgrid=False, zeroline=False, visible=False),
                yaxis=dict(showgrid=False, zeroline=False, visible=False),
                margin=dict(l=10, r=10, t=10, b=10),
                height=550,
            )
            st.plotly_chart(fig_g, use_container_width=True)
else:
    st.info("Nenhuma notícia com palavras-chave no período.")

st.divider()


# ------------------------------ TABELA COMPLETA -------------------------------
st.subheader("🗄️ Base de Dados Enriquecida")
busca = st.text_input("Buscar no título ou conteúdo:", "")
df_view = df.copy()
if busca.strip():
    padrao = busca.strip().lower()
    df_view = df_view[
        df_view['Título'].fillna('').str.lower().str.contains(padrao) |
        df_view['Conteúdo'].fillna('').str.lower().str.contains(padrao)
    ]

cols = ['ID', 'Título', 'Data', 'Categorias', 'Palavras-Chaves', 'É Evento',
        'Data do Evento', 'Data Fim Evento', 'Tipo do Evento',
        'Local do Evento', 'Horário do Evento', 'É Pago',
        'Valor do Evento', 'URL']
cols = [c for c in cols if c in df_view.columns]

st.dataframe(
    df_view[cols].sort_values('ID'),
    use_container_width=True,
    column_config={
        "URL": st.column_config.LinkColumn("Link"),
        "É Evento": st.column_config.CheckboxColumn("Evento?"),
        "É Pago": st.column_config.CheckboxColumn("Pago?"),
    },
    hide_index=True,
)

st.caption(
    f"Mostrando {len(df_view)} de {len(df)} notícias. "
    f"Arquivo: `{ARQUIVO_JSON}`"
)
# ------------------------------ CHATBOT ANALÍTICO -----------------------------
st.divider()
st.subheader("💬 Assistente Editorial - Inteligência Coletiva")
st.caption("Consulte tendências, indicadores e detalhes específicos do acervo com citações diretas.")

# 1. Preparação do dicionário de métricas (Contexto de BI para a IA)
# Usamos o 'df' total para garantir que a IA tenha visão do todo
metricas_para_chat = {
    "total_noticias": len(df),
    "media_palavras": int(df['Tamanho_Texto'].mean()) if not df.empty else 0,
    "categorizadas_ia": f"{len(df[df['Categorias'] != 'Não categorizado'])}/{len(df)}",
    "total_eventos": len(df[df['É Evento'] == True]) if 'É Evento' in df.columns else 0,
    "eventos_pagos": len(df[df['É Pago'] == True]) if 'É Pago' in df.columns else 0
}

# 2. Inicialização do histórico de mensagens
if "messages" not in st.session_state:
    st.session_state.messages = []

# 3. Exibição das mensagens anteriores
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# 4. Interface de entrada do usuário
if prompt_usuario := st.chat_input("Ex: Quais as principais notícias sobre a Praia da Saudade em 2026?"):
    # Adiciona pergunta ao histórico
    st.session_state.messages.append({"role": "user", "content": prompt_usuario})
    
    with st.chat_message("user"):
        st.markdown(prompt_usuario)

    # Resposta da Assistente
    with st.chat_message("assistant"):
        with st.spinner("Cruzando dados e acervo..."):
            from utils import responder_chat
            # Enviamos as mensagens, o dataframe atual e o dicionário de métricas calculado
            resposta = responder_chat(st.session_state.messages, df, metricas_para_chat)
            st.markdown(resposta)
    
    # Adiciona resposta ao histórico
    st.session_state.messages.append({"role": "assistant", "content": resposta})