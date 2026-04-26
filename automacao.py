import json
import os
import time
import requests
from bs4 import BeautifulSoup
from google import genai
from google.genai import types

# Configurações Iniciais
ARQUIVO_JSON = 'noticias.json'
BASE_URL = 'https://folhadecoqueiros.com.br/noticias/'

# Pega a chave da API das variáveis de ambiente (o servidor na nuvem vai injetar isso)
API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None

def rodar_backend():
    print("🚀 Iniciando automação semanal...")
    
    # 1. Carrega o banco atual
    if os.path.exists(ARQUIVO_JSON):
        with open(ARQUIVO_JSON, 'r', encoding='utf-8') as f:
            dados_existentes = json.load(f)
    else:
        dados_existentes = []
        
    urls_conhecidas = {d["URL"] for d in dados_existentes}
    
    # 2. CRAWLING INCREMENTAL (Busca apenas o que é novo)
    print("🔍 Buscando novas notícias no site...")
    novos_links = []
    pagina = 1
    parar_busca = False
    
    while not parar_busca and pagina <= 10: # Limite de segurança de 10 páginas
        url_paginacao = BASE_URL if pagina == 1 else f"{BASE_URL}page/{pagina}/"
        response = requests.get(url_paginacao, headers={'User-Agent': 'Mozilla/5.0'})
        if response.status_code != 200: break
        
        soup = BeautifulSoup(response.content, 'html.parser')
        artigos = soup.find_all('article')
        
        for art in artigos:
            link = art.find('a', href=True)['href']
            if link in urls_conhecidas:
                print(f"🛑 Link já conhecido encontrado. Parando a busca na página {pagina}.")
                parar_busca = True
                break
            else:
                if link not in novos_links:
                    novos_links.append(link)
        
        pagina += 1
        time.sleep(1)

    if not novos_links:
        print("✅ Nenhuma notícia nova nesta semana. Encerrando.")
        return

    print(f"📥 Baixando {len(novos_links)} novas notícias...")
    novos_dados = []
    for url in novos_links:
        # A mesma lógica de extração que você já tem no utils.py
        try:
            resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
            soup = BeautifulSoup(resp.content, 'html.parser')
            
            titulo = soup.find('h1', class_='elementor-heading-title').get_text(strip=True)
            data = soup.find('span', class_='elementor-post-info__item--type-date').get_text(strip=True)
            conteudo = soup.find('div', class_='elementor-widget-theme-post-content').get_text(separator='\n', strip=True)
            
            novos_dados.append({
                "URL": url, "Título": titulo, "Data": data, "Conteúdo": conteudo,
                "Categorias": "Não categorizado", "Palavras-Chaves": "N/A", "É Evento": False, 
                "Tipo do Evento": None, "Data do Evento": None, "Data Fim Evento": None, 
                "Local do Evento": None, "Horário do Evento": None, "É Pago": False, "Valor do Evento": None
            })
            print(f"   - Extraído: {titulo}")
        except Exception as e:
            print(f"   ❌ Erro ao extrair {url}: {e}")
        time.sleep(1)

    # 3. INTELIGÊNCIA ARTIFICIAL (Classifica as novas)
    if client and novos_dados:
        print("🧠 Iniciando categorização com Gemini API...")
        for idx, noticia in enumerate(novos_dados):
            prompt = f"""
            Analise a notícia e extraia os metadados em JSON estrito.
            Data: {noticia['Data']} | Título: {noticia['Título']} | Conteúdo: {noticia['Conteúdo']}
            
            RETORNE APENAS JSON COM AS CHAVES:
            "categoria_sugerida" (string), "palavras_chave" (string com termos separados por virgula), 
            "e_evento" (boolean), "tipo_evento" (string), "data_evento" (DD/MM/AAAA), 
            "data_fim_evento" (DD/MM/AAAA), "local_evento" (string), "e_pago" (boolean), "valor_evento" (string).
            """
            try:
                resposta = client.models.generate_content(
                    model='gemini-3.1-flash-lite-preview', 
                    contents=prompt, 
                    config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
                )
                res = json.loads(resposta.text)
                
                noticia.update({
                    'Categorias': res.get('categoria_sugerida', 'Diversos'),
                    'Palavras-Chaves': res.get('palavras_chave', 'N/A'),
                    'É Evento': res.get('e_evento', False),
                    'Tipo do Evento': res.get('tipo_evento'),
                    'Data do Evento': res.get('data_evento'),
                    'Data Fim Evento': res.get('data_fim_evento'),
                    'Local do Evento': res.get('local_evento'),
                    'É Pago': res.get('e_pago', False),
                    'Valor do Evento': res.get('valor_evento')
                })
                print(f"   ✅ IA processou: {noticia['Título']}")
            except Exception as e:
                print(f"   ⚠️ Erro na IA: {e}")
            
            # Pausa de 15s para não estourar a cota gratuita do Gemini (5 RPM)
            time.sleep(15)
            
    # 4. SALVAR E CONSOLIDAR
    dados_finais = novos_dados + dados_existentes
    with open(ARQUIVO_JSON, 'w', encoding='utf-8') as f:
        json.dump(dados_finais, f, ensure_ascii=False, indent=4)
        
    print(f"🎉 Sucesso! Banco atualizado com {len(novos_dados)} novas notícias.")

if __name__ == "__main__":
    rodar_backend()