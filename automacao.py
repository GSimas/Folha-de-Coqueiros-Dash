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
    
    # 1. Carrega o banco atual e define o próximo ID
    if os.path.exists(ARQUIVO_JSON):
        with open(ARQUIVO_JSON, 'r', encoding='utf-8') as f:
            dados_existentes = json.load(f)
    else:
        dados_existentes = []

    # Cálculo do próximo ID único
    if dados_existentes:
        # Pega o maior ID presente e soma 1
        id_proximo = max([int(d.get("ID", -1)) for d in dados_existentes]) + 1
    else:
        id_proximo = 0
        
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
            
            nova_entrada = {
                "ID": id_proximo, 
                "Título": titulo,
                "Data": data,
                "URL": url,
                "Conteúdo": conteudo,
                "Categorias": "Não categorizado",
                "Palavras-Chaves": "N/A",
                "É Evento": False,
                "Tipo do Evento": None,
                "Data do Evento": None,
                "Data Fim Evento": None,
                "Local do Evento": None,
                "Horário do Evento": None,
                "É Pago": False,
                "Valor do Evento": None
            }
            novos_dados.append(nova_entrada)
            print(f"   - Extraído [ID {id_proximo}]: {titulo}")
            
            id_proximo += 1 # Prepara o ID para a próxima notícia da lista
            
        except Exception as e:
            print(f"   ❌ Erro ao extrair {url}: {e}")
        time.sleep(1)

    # 3. INTELIGÊNCIA ARTIFICIAL (Classifica as novas)
    if client and novos_dados:
        print("🧠 Iniciando categorização com Gemini API...")
        
        CATEGORIAS_VALIDAS = [
            'Comunidade e Sociedade', 'Infraestrutura e Mobilidade', 'Educação',
            'Economia e Negócios', 'Cultura, Eventos e Gastronomia', 'Meio Ambiente',
            'Saúde e Bem-estar', 'Segurança', 'Política e Gestão Pública',
            'Obituário', 'Esportes'
        ]

        TIPOS_EVENTO_VALIDOS = [
            'Reuniões e Gestão Comunitária', 'Feiras e Mercados', 'Saúde e Meio Ambiente',
            'Artes, Cultura e Entretenimento', 'Outros / Institucional', 'Festas e Celebrações',
            'Esportes e Lazer', 'Educação, Palestras e Oficinas'
        ]

        for idx, noticia in enumerate(novos_dados):
            prompt = f"""
            Analise a notícia e extraia os metadados em JSON estrito.
            Data: {noticia['Data']} | Título: {noticia['Título']} | Conteúdo: {noticia['Conteúdo']}
            
            REGRAS OBRIGATÓRIAS:
            1. "categoria_sugerida" DEVE ser EXATAMENTE uma destas opções: {CATEGORIAS_VALIDAS}
            2. "tipo_evento" DEVE ser EXATAMENTE uma destas opções (se for evento) ou null: {TIPOS_EVENTO_VALIDOS}
            3. Não use formatação markdown (```json). Retorne apenas o objeto {{}}.
            
            RETORNE APENAS JSON COM AS CHAVES:
            "categoria_sugerida" (string), "palavras_chave" (string com termos separados por virgula), 
            "e_evento" (boolean), "tipo_evento" (string ou null), "data_evento" (DD/MM/AAAA ou null), 
            "data_fim_evento" (DD/MM/AAAA ou null), "local_evento" (string ou null), "e_pago" (boolean), "valor_evento" (string ou null).
            """
            
            # AMORTECEDOR DE FALHAS: Tenta até 3 vezes se o servidor estiver ocupado
            sucesso = False
            tentativas = 0
            max_tentativas = 3
            
            while not sucesso and tentativas < max_tentativas:
                try:
                    resposta = client.models.generate_content(
                        model='gemini-2.5-flash-lite', 
                        contents=prompt, 
                        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
                    )
                    
                    texto_limpo = resposta.text.replace("```json", "").replace("```", "").strip()
                    res = json.loads(texto_limpo)
                    
                    noticia.update({
                        'Categorias': res.get('categoria_sugerida', 'Comunidade e Sociedade'),
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
                    sucesso = True # Deu certo, sai do loop de tentativas
                    
                except Exception as e:
                    erro_str = str(e)
                    tentativas += 1
                    # Se for erro de superlotação (503) ou cota (429)
                    if "503" in erro_str or "429" in erro_str or "UNAVAILABLE" in erro_str:
                        print(f"   ⏳ Servidor ocupado. Aguardando 30s... (Tentativa {tentativas}/{max_tentativas})")
                        time.sleep(30)
                    else:
                        print(f"   ⚠️ Erro crítico na IA ao processar '{noticia['Título']}': {erro_str}")
                        break # Se for outro tipo de erro, não adianta tentar de novo
            
            # Pausa padrão de segurança entre uma notícia e outra
            time.sleep(15)
            
    # 4. SALVAR E CONSOLIDAR
    dados_finais = novos_dados + dados_existentes
    with open(ARQUIVO_JSON, 'w', encoding='utf-8') as f:
        json.dump(dados_finais, f, ensure_ascii=False, indent=4)
        
    print(f"🎉 Sucesso! Banco atualizado com {len(novos_dados)} novas notícias.")

if __name__ == "__main__":
    rodar_backend()