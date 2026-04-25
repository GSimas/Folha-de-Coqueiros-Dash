import pandas as pd
import json

# 1. Defina o nome do seu arquivo CSV
arquivo_csv = 'Dash-FolhaCoqueiros_2026-04-24 - Dash-FolhaCoqueiros_2026-04-24T22-06_export.csv'
arquivo_json = 'noticias.json'

print("Lendo o arquivo CSV...")
# 2. Carrega o CSV usando o Pandas
df = pd.read_csv(arquivo_csv)

# 3. Tratamento de Dados (Limpeza)
# Preenche os campos vazios (NaN) com valores adequados para não quebrar o Dashboard
df = df.fillna(value={
    'Categorias': 'Não categorizado',
    'Palavras-Chaves': 'N/A',
    'É Evento': False,
    'Tipo do Evento': None,
    'Data Início Evento': None,
    'Data Fim Evento': None,
    'Local do Evento': None,
    'Horário do Evento': None,
    'É Pago': False,
    'Valor do Evento': None
})

# Renomeia a coluna 'Data Início Evento' para 'Data do Evento' 
# para que encaixe perfeitamente com a estrutura que já criamos no Geral.py
df = df.rename(columns={'Data Início Evento': 'Data do Evento'})

# 4. Conversão para Dicionário
# 'orient="records"' transforma as linhas do Excel/CSV em uma lista de objetos JSON
dados_json = df.to_dict(orient='records')

# 5. Salva o arquivo JSON
print(f"Salvando dados em {arquivo_json}...")
with open(arquivo_json, 'w', encoding='utf-8') as f:
    json.dump(dados_json, f, ensure_ascii=False, indent=4)

print(f"✅ Sucesso! {len(dados_json)} notícias foram convertidas e salvas no formato JSON.")