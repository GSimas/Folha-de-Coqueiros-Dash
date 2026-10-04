"""
Classificação de notícias com Jev (TypeSafe System One).

Jev não gera texto: devolve julgamentos tipados (Choice, Noul) com
probabilidades. Por isso a classificação segue o padrão "selecionar em vez de
gerar" — o código encontra candidatos no texto e o Jev escolhe entre eles:

  categoria (11) .......... Choice com critérios descritivos
  é evento / é pago ....... Noul (pago é especulativo: só vale se for evento)
  tipo de evento (8) ...... Choice especulativo, com opção "não é evento"
  data início/fim, horário,
  valor, local ............ regex/código acham candidatos → Choice escolhe um
                            (ou "nenhum"); datas montadas em código a partir
                            da data de publicação (Jev não faz aritmética)
  palavras-chave .......... vocabulário do acervo presente no texto → um Noul
                            por candidato ("é tema central?") → código fica
                            com os mais prováveis
  atores .................. atores já conhecidos citados no texto são ligados
                            direto; nomes próprios novos → Choice de tipo
                            (Pessoa/Organização/Local/Empresa/não é entidade);
                            a descrição é a frase onde o nome aparece

Tudo vai numa única requisição por notícia (fan-out): as perguntas rodam em
paralelo sobre o mesmo estado, e o código consome só as que se aplicam.
Docs: https://docs.typesafe.ai/llms.txt
"""

from __future__ import annotations

import re
import time
import unicodedata
from collections import Counter
from datetime import date, timedelta

import requests

URL_API = "https://api.typesafe.ai/v1"
NENHUM = "nenhum"
LIMIAR_SIM = 0.5

MAX_CARACTERES_TEXTO = 7000  # estado enxuto: Jev perde precisão com contexto irrelevante
MAX_CANDIDATOS_PALAVRAS = 20
MAX_CANDIDATOS_ATORES = 20
MAX_CANDIDATOS_VALOR = 12
MAX_ATORES_NOVOS = 6
LIMIAR_RELEVANCIA_ATOR = 0.6
LIMIAR_CONFIANCA_TIPO = 0.5


class ErroJev(Exception):
    def __init__(self, mensagem: str, fatal: bool = False):
        super().__init__(mensagem)
        self.fatal = fatal


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento).strip().lower()


def contem_termo(texto_normalizado: str, termo: str) -> bool:
    alvo = normalizar(termo)
    return bool(alvo) and re.search(rf"(?<![a-z0-9]){re.escape(alvo)}(?![a-z0-9])", texto_normalizado) is not None


# =============================================================================
# Critérios das perguntas fixas
# =============================================================================
CATEGORIAS = {
    "Comunidade e Sociedade": "Neighborhood life, residents, community associations, social causes, local stories and personalities, history of the neighborhood.",
    "Infraestrutura e Mobilidade": "Roads, traffic, public transport, sidewalks, bike lanes, construction works, urban planning, sanitation, lighting.",
    "Educação": "Schools, universities, students, teachers, courses, educational programs.",
    "Economia e Negócios": "Local businesses, shops, restaurants opening or closing, commerce, employment, real estate market.",
    "Cultura, Eventos e Gastronomia": "Arts, music, festivals, exhibitions, cultural events, fairs, food and gastronomy.",
    "Meio Ambiente": "Parks, beaches, nature, pollution, environmental protection, animals, climate.",
    "Saúde e Bem-estar": "Health centers, hospitals, vaccination, public health campaigns, wellness, physical activity for health.",
    "Segurança": "Crime, policing, public safety, accidents, emergencies, civil defense.",
    "Política e Gestão Pública": "City hall, city council, elections, public administration, laws, public policies, government decisions.",
    "Obituário": "Death of a person, funeral, posthumous tribute.",
    "Esportes": "Sports teams, competitions, athletes, matches, sports results.",
}

TIPOS_EVENTO = {
    "Reuniões e Gestão Comunitária": "Community meetings, assemblies, public hearings, neighborhood councils.",
    "Feiras e Mercados": "Fairs, markets, bazaars, food or craft markets.",
    "Saúde e Meio Ambiente": "Health campaigns, vaccination drives, clean-ups, environmental actions.",
    "Artes, Cultura e Entretenimento": "Shows, concerts, theater, exhibitions, film screenings, cultural festivals.",
    "Outros / Institucional": "Institutional ceremonies, inaugurations, launches, or events that fit no other type.",
    "Festas e Celebrações": "Parties, popular festivities, commemorations, religious celebrations.",
    "Esportes e Lazer": "Races, tournaments, sports activities, recreation.",
    "Educação, Palestras e Oficinas": "Lectures, workshops, courses, seminars, classes.",
}

TIPOS_ATOR = {
    "Pessoa": "A specific named person.",
    "Organização": "A named institution, association, government body, school, church, team or NGO.",
    "Local": "A named place: street, square, park, beach, neighborhood, building or city.",
    "Empresa": "A named private company, shop, restaurant or brand.",
    "nao_entidade": "Not a named person, organization, place or company (a generic word, a title, a month, an event name, or a broken fragment).",
}

CONTEXTO = "the Portuguese-language news article in `texto` from Folha de Coqueiros, a local newspaper of the Coqueiros neighborhood in Florianópolis, Brazil"

# =============================================================================
# Candidatos extraídos em código
# =============================================================================
MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}
DIAS_SEMANA = {"segunda": 0, "terca": 1, "quarta": 2, "quinta": 3, "sexta": 4, "sabado": 5, "domingo": 6}

_RE_MES = r"(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)"
_RE_SEMANA = r"(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?"
PADROES_DATA = [
    re.compile(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b"),
    re.compile(rf"\b\d{{1,2}}(?:º|°)?\s+de\s+{_RE_MES}(?:\s+de\s+\d{{4}})?\b", re.IGNORECASE),
    re.compile(r"\bdia\s+\d{1,2}\b", re.IGNORECASE),
    re.compile(rf"\b(?:(?:neste|nesta|pr[oó]ximo|pr[oó]xima|este|esta)\s+)?{_RE_SEMANA}\b", re.IGNORECASE),
    re.compile(r"\b(?:hoje|amanh[aã])\b", re.IGNORECASE),
]
PADROES_HORA = [
    re.compile(r"\b\d{1,2}h\d{0,2}\b", re.IGNORECASE),
    re.compile(r"\b\d{1,2}:\d{2}\b"),
    re.compile(r"\b\d{1,2}\s*horas\b", re.IGNORECASE),
]
PADRAO_VALOR = re.compile(r"R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?")
_MAIUSC = "A-ZÁÉÍÓÚÂÊÔÃÕÇÀ"
# Palavra capitalizada (sem ponto, exceto abreviações comuns de endereços e títulos).
_PALAVRA_PROPRIA = rf"(?:(?:Av|Eng|Dr|Dra|Prof|Profa|Sr|Sra|Pe|Sta|Sto|Gov|Des|Ver)\.|[{_MAIUSC}][\wÀ-ÿ'’\-]*)"
# Só espaços na mesma linha separam as palavras de um nome; "e" não une nomes.
_SEQUENCIA = rf"{_PALAVRA_PROPRIA}(?:[ \t]+(?:(?:de|da|do|dos|das)[ \t]+)?{_PALAVRA_PROPRIA}){{0,8}}"
PADRAO_NOME_PROPRIO = re.compile(_SEQUENCIA)
PADRAO_LOCAL = re.compile(rf"\b(?:no|na|nos|nas|em|local:)[ \t]+({_SEQUENCIA})")

PALAVRAS_COMUNS = {
    normalizar(p)
    for p in (
        "A O As Os Um Uma Em No Na Nos Nas De Do Da Para Com Por Pelo Pela Foto Fotos Divulgação Leia Mais Segundo "
        "Ele Ela Eles Elas Também Já Mas Este Esta Esse Essa Isso Aqui Ali Quando Onde Como Porque Então Hoje Amanhã "
        "Ontem Neste Nesta Próximo Próxima Durante Após Antes Depois Além Entre Sobre Sem Até Desde Cada Todos Todas "
        "Sim Não Já Ainda Se Seu Sua Nosso Nossa Confira Veja Saiba Acesse Clique Informações Serviço Data Local "
        "Horário Valor Entrada Inscrições Contato Telefone Site Instagram Facebook WhatsApp Endereço Rua Avenida "
        "Programação Evento Atrações Agenda Fonte Crédito Créditos "
        # Papéis que antecedem nomes ("Morador da Vila Aparecida", "Presidente Gerusa…")
        "Morador Moradora Moradores Moradoras Presidente Prefeito Prefeita Vereador Vereadora Secretário "
        "Secretária Diretor Diretora Coordenador Coordenadora Professor Professora Aluno Aluna Atleta "
        "Domingo Segunda Terça "
        "Quarta Quinta Sexta Sábado Janeiro Fevereiro Março Abril Maio Junho Julho Agosto Setembro Outubro Novembro Dezembro"
    ).split()
}


def _unicos(itens, limite: int | None = None) -> list[str]:
    vistos, saida = set(), []
    for item in itens:
        chave = normalizar(item)
        if item and chave not in vistos:
            vistos.add(chave)
            saida.append(item.strip())
            if limite and len(saida) >= limite:
                break
    return saida


def candidatos_data(texto: str) -> list[str]:
    return _unicos(m.group(0) for padrao in PADROES_DATA for m in padrao.finditer(texto))


def candidatos_hora(texto: str) -> list[str]:
    return [h for h in _unicos(m.group(0) for p in PADROES_HORA for m in p.finditer(texto)) if normalizar_hora(h)]


def candidatos_valor(texto: str) -> list[str]:
    return _unicos((m.group(0) for m in PADRAO_VALOR.finditer(texto)), MAX_CANDIDATOS_VALOR)


_TERMINACOES_VERBAIS = ("ou", "ram", "ava", "avam", "iam", "eu", "iu", "aram", "eram", "iram")


def _maiuscula_de_frase(palavra: str, texto: str) -> bool:
    """A primeira palavra da frase é só maiúscula de sentença (palavra comum, verbo)?"""
    p = normalizar(palavra)
    minuscula = palavra[0].lower() + palavra[1:]
    return (
        p in PALAVRAS_COMUNS
        or (len(p) > 3 and p.endswith(_TERMINACOES_VERBAIS))
        or re.search(rf"(?<!\w){re.escape(minuscula)}(?!\w)", texto) is not None  # aparece em minúscula
    )


def nomes_proprios(texto: str) -> Counter:
    """Sequências de palavras capitalizadas (nomes próprios prováveis), com frequência."""
    contagem: Counter = Counter()
    for frase in re.split(r"(?<=[.!?:\n])\s+", texto):
        for m in PADRAO_NOME_PROPRIO.finditer(frase):
            nome = m.group(0).strip(" .-’'")
            palavras = nome.split()
            no_inicio = m.start() == 0
            # Palavra única no início da frase costuma ser só maiúscula de sentença.
            if len(palavras) == 1 and no_inicio and not nome.isupper():
                continue
            if normalizar(palavras[0]) in PALAVRAS_COMUNS or (
                no_inicio and len(palavras) > 1 and _maiuscula_de_frase(palavras[0], texto)
            ):
                palavras = palavras[1:]
                nome = " ".join(palavras)
            while palavras and normalizar(palavras[0]) in ("de", "da", "do", "dos", "das"):
                palavras = palavras[1:]
            nome = " ".join(palavras)
            if not palavras or len(nome) < 3 or all(normalizar(p) in PALAVRAS_COMUNS for p in palavras):
                continue
            contagem[nome] += 1
    # Palavra única só vale se for sigla (UFSC) ou aparecer mais de uma vez:
    # nomes soltos citados uma vez ("Edson", "Melissa") raramente são atores úteis.
    return Counter({n: c for n, c in contagem.items() if " " in n or n.isupper() and len(n) >= 2 or c >= 2})


def sem_prefixos(nomes: list[str]) -> list[str]:
    """Remove nomes que são o começo de outro candidato ("Gerusa" ⊂ "Gerusa Machado")."""
    normais = [normalizar(n) for n in nomes]
    return [
        n
        for n, a in zip(nomes, normais)
        if not any(b != a and b.startswith(a + " ") for b in normais)
    ]


def candidatos_local(texto: str, locais_conhecidos: list[str]) -> list[str]:
    texto_norm = normalizar(texto)
    conhecidos = [l for l in locais_conhecidos if len(l) >= 4 and contem_termo(texto_norm, l)]
    achados = [m.group(1).strip(" .") for m in PADRAO_LOCAL.finditer(texto)]
    achados = [a for a in achados if normalizar(a.split()[0]) not in PALAVRAS_COMUNS]
    return _unicos(conhecidos + achados, 15)


def candidatos_palavras(titulo: str, texto: str, vocabulario: Counter, nomes: list[str] | None = None) -> list[str]:
    """
    Termos do vocabulário de palavras-chave do acervo que aparecem na notícia,
    completados com nomes próprios da notícia — assim assuntos novos também
    têm candidatos.
    """
    titulo_norm, texto_norm = normalizar(titulo), normalizar(texto)
    pontuados = []
    for termo, freq in vocabulario.items():
        if len(termo) < 3 or not contem_termo(texto_norm + " " + titulo_norm, termo):
            continue
        no_titulo = contem_termo(titulo_norm, termo)
        ocorrencias = len(re.findall(rf"(?<![a-z0-9]){re.escape(normalizar(termo))}(?![a-z0-9])", texto_norm))
        pontuados.append((no_titulo * 5 + min(ocorrencias, 5) + min(freq, 20) / 10, termo))
    pontuados.sort(reverse=True)
    termos = [t for _, t in pontuados]
    return _unicos(termos + (nomes or [])[:8], MAX_CANDIDATOS_PALAVRAS)


def vocabulario_do_acervo(noticias: list[dict]) -> Counter:
    """Palavras-chave já atribuídas no acervo (forma mais comum de cada termo), com frequência."""
    por_chave: dict[str, Counter] = {}
    for n in noticias:
        bruto = n.get("Palavras-Chaves")
        if not bruto or bruto == "N/A":
            continue
        for termo in str(bruto).split(","):
            termo = termo.strip()
            if 2 < len(termo) <= 40:
                por_chave.setdefault(normalizar(termo), Counter())[termo] += 1
    vocab: Counter = Counter()
    for formas in por_chave.values():
        forma, _ = formas.most_common(1)[0]
        vocab[forma] = sum(formas.values())
    return Counter({t: f for t, f in vocab.items() if f >= 2})


def frase_com(texto: str, nome: str) -> str:
    """Descrição extrativa: a primeira frase em que o nome aparece."""
    for frase in re.split(r"(?<=[.!?])\s+|\n+", texto):
        if nome in frase:
            return frase.strip()[:220]
    return ""


# =============================================================================
# Datas e horários (código, a partir da data de publicação)
# =============================================================================
def _data_publicacao(texto: str | None) -> date:
    try:
        d, m, a = map(int, (texto or "").split("/"))
        return date(a, m, d)
    except ValueError:
        return date.today()


def _criar(ano: int, mes: int, dia: int) -> date | None:
    try:
        return date(ano, mes, dia)
    except ValueError:
        return None


def resolver_data(expressao: str, publicacao: date) -> str | None:
    """Converte a expressão escolhida pelo Jev em DD/MM/AAAA, contando a partir da publicação."""
    e = normalizar(expressao)
    resultado: date | None = None

    if m := re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", e):
        dia, mes = int(m.group(1)), int(m.group(2))
        ano = int(m.group(3)) if m.group(3) else None
        if ano is not None and ano < 100:
            ano += 2000
        resultado = _criar(ano or publicacao.year, mes, dia)
        # Sem ano e já bem no passado: o evento é do ano seguinte.
        if resultado and ano is None and resultado < publicacao - timedelta(days=30):
            resultado = _criar(publicacao.year + 1, mes, dia)
    elif m := re.fullmatch(r"(\d{1,2})(?:o)?\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?", e):
        mes = MESES.get(m.group(2))
        if mes:
            ano = int(m.group(3)) if m.group(3) else None
            resultado = _criar(ano or publicacao.year, mes, int(m.group(1)))
            if resultado and ano is None and resultado < publicacao - timedelta(days=30):
                resultado = _criar(publicacao.year + 1, mes, int(m.group(1)))
    elif m := re.fullmatch(r"dia (\d{1,2})", e):
        dia = int(m.group(1))
        ano, mes = publicacao.year, publicacao.month
        if dia < publicacao.day:  # "dia 5" publicado no dia 20 → mês seguinte
            mes += 1
            if mes > 12:
                ano, mes = ano + 1, 1
        resultado = _criar(ano, mes, dia)
    elif e == "hoje":
        resultado = publicacao
    elif e in ("amanha",):
        resultado = publicacao + timedelta(days=1)
    elif m := re.fullmatch(r"(?:(neste|nesta|este|esta|proximo|proxima)\s+)?(\w+?)(?:-feira)?", e):
        alvo = DIAS_SEMANA.get(m.group(2))
        if alvo is not None:
            distancia = (alvo - publicacao.weekday()) % 7
            if distancia == 0 and m.group(1) in ("proximo", "proxima"):
                distancia = 7
            resultado = publicacao + timedelta(days=distancia)

    # Evento anunciado não acontece meses antes da publicação: um ano explícito
    # que leva a isso é erro de digitação na matéria ("12 de maio de 2025" numa
    # notícia de maio de 2026). Mantém dia e mês com o ano da publicação.
    if resultado and resultado < publicacao - timedelta(days=60):
        corrigido = _criar(publicacao.year, resultado.month, resultado.day)
        if corrigido and corrigido >= publicacao - timedelta(days=60):
            resultado = corrigido
    return resultado.strftime("%d/%m/%Y") if resultado else None


def normalizar_hora(expressao: str) -> str | None:
    e = normalizar(expressao).replace(" ", "")
    m = re.fullmatch(r"(\d{1,2})(?:h|:|horas)(\d{2})?", e)
    if not m:
        return None
    hora, minuto = int(m.group(1)), int(m.group(2) or 0)
    return f"{hora:02d}:{minuto:02d}" if hora < 24 and minuto < 60 else None


# =============================================================================
# Montagem da requisição
# =============================================================================
def _escolha(instrucoes: str, opcoes: dict, nenhum: str | None = None) -> dict:
    criterios = dict(opcoes)
    if nenhum:
        criterios[NENHUM] = nenhum
    return {"type": "choice", "instructions": instrucoes, "criteria": criterios}


def _noul(instrucoes: str, sim: str, nao: str) -> dict:
    return {"type": "noul", "instructions": instrucoes, "criteria": {"true": sim, "false": nao}}


def montar_requisicao(noticia: dict, atores_base: list[dict], vocabulario: Counter) -> tuple[dict, dict]:
    """Devolve (corpo da requisição, candidatos usados) para uma notícia."""
    titulo = noticia.get("Título") or ""
    texto = (noticia.get("Conteúdo") or "")[:MAX_CARACTERES_TEXTO]
    texto_norm = normalizar(texto + " " + titulo)

    # Atores já conhecidos citados no texto: ligados direto, sem pergunta.
    conhecidos = [a for a in atores_base if len(a.get("Nome", "")) >= 4 and contem_termo(texto_norm, a["Nome"])]
    nomes_conhecidos = {normalizar(a["Nome"]) for a in conhecidos}
    novos = sem_prefixos(
        [nome for nome, _ in nomes_proprios(titulo + ".\n" + texto).most_common() if normalizar(nome) not in nomes_conhecidos]
    )[:MAX_CANDIDATOS_ATORES]

    # O título costuma trazer a data e o local do evento ("Mercadão no sábado, dia 13").
    completo = f"{titulo}.\n{texto}"
    candidatos = {
        "datas": candidatos_data(completo),
        "horas": candidatos_hora(completo),
        "valores": candidatos_valor(completo),
        "locais": candidatos_local(completo, [a["Nome"] for a in atores_base if a.get("Tipo") == "Local"]),
        "palavras": candidatos_palavras(titulo, texto, vocabulario, novos + [a["Nome"] for a in conhecidos]),
        "atores_novos": novos,
        "atores_conhecidos": conhecidos,
    }

    estado = {
        "titulo": titulo,
        "data_publicacao": noticia.get("Data") or "",
        "texto": texto,
        "candidatos_palavras": candidatos["palavras"],
        "candidatos_atores": novos,
    }

    perguntas: dict[str, dict] = {
        "categoria": _escolha(f"Which editorial category best describes the main subject of {CONTEXTO}?", CATEGORIAS),
        "e_evento": _noul(
            f"Does {CONTEXTO} announce or promote a scheduled upcoming event (fair, party, meeting, lecture, show, workshop, race, campaign day) with an identifiable date that readers could attend?",
            "The article invites readers to a specific upcoming event with a date.",
            "No upcoming event: coverage of something that already happened, an obituary, or general news.",
        ),
        "tipo_evento": _escolha(
            f"Assume {CONTEXTO} announces an event. Which type of event is it?",
            TIPOS_EVENTO,
            "The article does not announce any event.",
        ),
        "e_pago": _noul(
            f"Assume {CONTEXTO} announces an event. Does attending require paying (ticket, entrance fee or paid registration)?",
            "Attendance has a price.",
            "Free admission, or no price is mentioned.",
        ),
    }

    if candidatos["datas"]:
        opcoes = {d: None for d in candidatos["datas"]}
        perguntas["data_inicio"] = _escolha(
            "Which of these expressions from the article gives the date (or first day) of the announced event?",
            opcoes,
            "None of them is the event date, or there is no event.",
        )
        perguntas["data_fim"] = _escolha(
            "If the announced event lasts several days, which of these expressions gives its last day?",
            opcoes,
            "The event lasts a single day, there is no last day stated, or there is no event.",
        )
    if candidatos["horas"]:
        perguntas["horario"] = _escolha(
            "Which of these expressions from the article gives the starting time of the announced event?",
            {h: None for h in candidatos["horas"]},
            "None of them is the event starting time, or there is no event.",
        )
    if candidatos["valores"]:
        perguntas["valor"] = _escolha(
            "Which of these amounts is the price to attend the announced event (ticket or entrance)?",
            {v: None for v in candidatos["valores"]},
            "None of them is the price to attend the event.",
        )
    if candidatos["locais"]:
        perguntas["local"] = _escolha(
            "Which of these is the place where the announced event takes place?",
            {l: None for l in candidatos["locais"]},
            "None of them is where the event takes place, or there is no event.",
        )
    for i in range(len(candidatos["palavras"])):
        perguntas[f"palavra_{i}"] = _noul(
            f"Is `candidatos_palavras[{i}]` one of the central topics of the article in `texto` (not just mentioned in passing)?",
            "A central topic of the article.",
            "Peripheral, only mentioned in passing, or unrelated.",
        )
    for i in range(len(novos)):
        perguntas[f"ator_{i}"] = _escolha(
            f"In the article in `texto`, what kind of named entity is `candidatos_atores[{i}]`?",
            TIPOS_ATOR,
        )
        perguntas[f"ator_relevante_{i}"] = _noul(
            f"Does `candidatos_atores[{i}]` play a role in the facts reported in `texto` (subject, participant, organizer, speaker, or the place where the facts happen)?",
            "It takes part in or is central to the reported facts.",
            "Only a photo credit, a byline, an address detail, a passing mention, or not a real name.",
        )

    return {"state": estado, "questions": perguntas}, candidatos


# =============================================================================
# Interpretação das respostas
# =============================================================================
def _escolhido(respostas: dict, chave: str) -> str | None:
    escolha = (respostas.get(chave) or {}).get("choice")
    return None if escolha in (None, NENHUM) else escolha


def _prob(respostas: dict, chave: str) -> float:
    return float((respostas.get(chave) or {}).get("noul") or 0.0)


def interpretar(noticia: dict, respostas: dict, candidatos: dict) -> dict:
    """Converte as respostas do Jev no mesmo formato do classificador por LLM."""
    publicacao = _data_publicacao(noticia.get("Data"))
    texto = noticia.get("Conteúdo") or ""

    # Palavras-chave: as de maior probabilidade acima do limiar (3 a 5); se
    # poucas passarem, completa com as melhores restantes ainda plausíveis.
    probabilidades = sorted(
        ((_prob(respostas, f"palavra_{i}"), termo) for i, termo in enumerate(candidatos["palavras"])), reverse=True
    )
    def redundante(termo: str, lista: list[str]) -> bool:
        a = normalizar(termo)
        return any(a in normalizar(b) or normalizar(b) in a for b in lista)

    escolhidas: list[str] = []
    for p, termo in probabilidades:
        if p >= LIMIAR_SIM and len(escolhidas) < 5 and not redundante(termo, escolhidas):
            escolhidas.append(termo)
    if len(escolhidas) < 3:
        for p, termo in probabilidades:
            if len(escolhidas) < 3 and p >= 0.2 and not redundante(termo, escolhidas):
                escolhidas.append(termo)
    if not escolhidas and probabilidades:  # nunca deixa a notícia sem palavra-chave
        escolhidas = [probabilidades[0][1]]

    atores = [{"nome": a["Nome"], "tipo": a["Tipo"], "descricao": a.get("Descricao", "")} for a in candidatos["atores_conhecidos"]]
    # Novos atores: entidade nomeada com tipo confiável E papel nos fatos; no
    # máximo MAX_ATORES_NOVOS por notícia, os de maior relevância.
    aceitos = []
    for i, nome in enumerate(candidatos["atores_novos"]):
        resposta_tipo = respostas.get(f"ator_{i}") or {}
        tipo = _escolhido(respostas, f"ator_{i}")
        relevancia = _prob(respostas, f"ator_relevante_{i}")
        if (
            tipo
            and tipo != "nao_entidade"
            and float(resposta_tipo.get("confidence") or 0) >= LIMIAR_CONFIANCA_TIPO
            and relevancia >= LIMIAR_RELEVANCIA_ATOR
        ):
            aceitos.append((relevancia, nome, tipo))
    for _, nome, tipo in sorted(aceitos, reverse=True)[:MAX_ATORES_NOVOS]:
        atores.append({"nome": nome, "tipo": tipo, "descricao": frase_com(texto, nome)})

    e_evento = _prob(respostas, "e_evento") >= LIMIAR_SIM
    data_inicio = _escolhido(respostas, "data_inicio")
    data_fim = _escolhido(respostas, "data_fim")
    horario = _escolhido(respostas, "horario")
    valor = _escolhido(respostas, "valor")
    e_pago = e_evento and _prob(respostas, "e_pago") >= LIMIAR_SIM

    categoria = respostas.get("categoria") or {}
    return {
        "categoria": categoria.get("choice"),
        "palavras_chave": ", ".join(escolhidas),
        "e_evento": e_evento,
        "tipo_evento": _escolhido(respostas, "tipo_evento"),
        "data_evento": resolver_data(data_inicio, publicacao) if data_inicio else None,
        "data_fim_evento": resolver_data(data_fim, publicacao) if data_fim else None,
        "local_evento": _escolhido(respostas, "local"),
        "horario_evento": normalizar_hora(horario) if horario else None,
        "e_pago": e_pago,
        "valor_evento": (valor.replace(" ", "") if valor else None) if e_pago else ("R$0,00" if e_evento else None),
        "atores": atores,
        "_confianca_categoria": categoria.get("confidence"),
    }


# =============================================================================
# Cliente HTTP
# =============================================================================
class ClassificadorJev:
    def __init__(self, chave: str, modelo: str = "jev-latest", sessao: requests.Session | None = None):
        self.chave = chave
        self.modelo = modelo
        self.sessao = sessao or requests.Session()
        self.modelo_respondente: str | None = None

    def _cabecalhos(self) -> dict:
        return {"Authorization": f"Bearer {self.chave}", "Content-Type": "application/json"}

    def validar(self) -> None:
        resposta = self.sessao.get(f"{URL_API}/models", headers=self._cabecalhos(), timeout=30)
        if resposta.status_code in (401, 403):
            raise ErroJev(f"TypeSafe recusou a chave (HTTP {resposta.status_code}). Atualize o secret TYPESAFE_API_KEY.", fatal=True)

    def perguntar(self, corpo: dict) -> dict:
        payload = {"model": self.modelo, **corpo}
        for tentativa in range(1, 5):
            try:
                resposta = self.sessao.post(f"{URL_API}/systemone", json=payload, headers=self._cabecalhos(), timeout=90)
            except requests.RequestException as erro:
                if tentativa == 4:
                    raise ErroJev(f"falha de rede: {erro.__class__.__name__}") from erro
                time.sleep(5 * tentativa)
                continue
            if resposta.status_code in (401, 403):
                raise ErroJev(f"TypeSafe recusou a chave (HTTP {resposta.status_code})", fatal=True)
            if resposta.status_code == 402:
                raise ErroJev("sem créditos na conta TypeSafe", fatal=True)
            if resposta.status_code == 429 or resposta.status_code >= 500:
                if tentativa == 4:
                    raise ErroJev(f"TypeSafe indisponível ou limite de uso (HTTP {resposta.status_code})")
                try:
                    espera = min(float(resposta.headers.get("retry-after", "")), 30)
                except ValueError:
                    espera = 5 * tentativa
                time.sleep(espera)
                continue
            if not resposta.ok:
                raise ErroJev(f"HTTP {resposta.status_code}: {resposta.text[:300]}")
            dados = resposta.json()
            self.modelo_respondente = dados.get("model")
            return dados.get("answers") or {}
        raise ErroJev("sem resposta")

    def classificar(self, noticia: dict, contexto: dict) -> dict:
        corpo, candidatos = montar_requisicao(noticia, contexto["atores"], contexto["vocabulario"])
        respostas = self.perguntar(corpo)
        if "categoria" not in respostas:
            raise ErroJev("resposta sem a pergunta de categoria")
        return interpretar(noticia, respostas, candidatos)
