"""Testes do classificador Jev. Rode com:  python3 -m unittest tests/test_classificador_jev.py"""

import json
import sys
import tempfile
import unittest
from unittest import mock
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import automacao  # noqa: E402
import classificador_jev as j  # noqa: E402

NOTICIA = {
    "ID": 900,
    "Título": "Mercadão de Queijos acontece no sábado, dia 13, em Coqueiros. Evento é das 10h às 18h.",
    "Data": "12/06/2026",
    "Conteúdo": (
        "A feira do Mercadão de Queijos reúne produtores de Águas Mornas e Palhoça na Praça Vinte e Um de Abril.\n"
        "A organização é da Associação dos Moradores de Coqueiros. Gerusa Machado, presidente da entidade, "
        "convida a comunidade. Gerusa lembra que a entrada é gratuita. Ingresso para o show custa R$ 20,00."
    ),
}
ATORES = [
    {"ID_Ator": 0, "Nome": "Palhoça", "Tipo": "Local", "Descricao": "Município vizinho", "Noticias": [1]},
    {"ID_Ator": 1, "Nome": "Folha de Coqueiros", "Tipo": "Organização", "Descricao": "Jornal", "Noticias": [1]},
]
VOCAB = Counter({"Feira": 30, "Queijos": 4, "Coqueiros": 50, "Saúde": 40, "Gastronomia": 12})


class Candidatos(unittest.TestCase):
    def test_nomes_proprios_nao_atravessam_frases_nem_juntam_com_e(self):
        nomes = j.nomes_proprios("Falou Jorge Fernando Schneider\nNo sábado, Braço do Norte e Major Gercino.")
        self.assertIn("Jorge Fernando Schneider", nomes)
        self.assertIn("Braço do Norte", nomes)
        self.assertIn("Major Gercino", nomes)
        self.assertFalse(any("\n" in n or " e " in n for n in nomes))

    def test_palavras_tem_candidatos_mesmo_sem_vocabulario(self):
        candidatos = j.candidatos_palavras("Abraço Centenário à Ponte Hercílio Luz", "Texto curto.", Counter(), ["Ponte Hercílio Luz"])
        self.assertIn("Ponte Hercílio Luz", candidatos)
        self.assertIn("Centenário", candidatos)

    def test_remove_prefixos_de_nomes_mais_longos(self):
        self.assertEqual(j.sem_prefixos(["Gerusa", "Gerusa Machado", "Centro de Saúde", "Centro de Saúde da Vila"]),
                         ["Gerusa Machado", "Centro de Saúde da Vila"])

    def test_candidatos_de_data_hora_valor(self):
        texto = "No sábado, dia 13 de junho, das 10h às 18h30. Ingresso R$ 20,00. Próxima reunião em 15/07."
        self.assertEqual(sorted(j.candidatos_data(texto)), sorted(["13 de junho", "15/07", "dia 13", "sábado"]))
        self.assertEqual(j.candidatos_hora(texto), ["10h", "18h30"])
        self.assertEqual(j.candidatos_valor(texto), ["R$ 20,00"])

    def test_vocabulario_usa_forma_mais_comum_e_descarta_raros(self):
        noticias = [{"Palavras-Chaves": "Feira, saúde"}, {"Palavras-Chaves": "feira, Saúde"}, {"Palavras-Chaves": "Saúde, único"}]
        vocab = j.vocabulario_do_acervo(noticias)
        self.assertEqual(vocab["Saúde"], 3)
        self.assertEqual(sum(1 for t in vocab if j.normalizar(t) == "feira"), 1)
        self.assertNotIn("único", vocab)


class Datas(unittest.TestCase):
    pub = date(2026, 6, 12)  # sexta-feira

    def test_expressoes_resolvidas_a_partir_da_publicacao(self):
        casos = {
            "13 de junho": "13/06/2026",
            "13 de junho de 2027": "13/06/2027",
            "15/07": "15/07/2026",
            "15/07/26": "15/07/2026",
            "dia 13": "13/06/2026",
            "dia 5": "05/07/2026",  # dia já passou no mês → mês seguinte
            "sábado": "13/06/2026",
            "próxima sexta-feira": "19/06/2026",
            "hoje": "12/06/2026",
            "amanhã": "13/06/2026",
            "10 de janeiro": "10/01/2027",  # sem ano e já passado → ano seguinte
        }
        for expressao, esperado in casos.items():
            self.assertEqual(j.resolver_data(expressao, self.pub), esperado, expressao)

    def test_datas_invalidas_viram_none(self):
        self.assertIsNone(j.resolver_data("31/02", self.pub))
        self.assertIsNone(j.resolver_data("13 de smarch", self.pub))

    def test_horarios(self):
        self.assertEqual([j.normalizar_hora(h) for h in ["10h", "18h30", "7:05", "20 horas", "25h"]],
                         ["10:00", "18:30", "07:05", "20:00", None])


class Requisicao(unittest.TestCase):
    def setUp(self):
        self.corpo, self.candidatos = j.montar_requisicao(NOTICIA, ATORES, VOCAB)

    def test_estrutura_valida_para_a_api(self):
        perguntas = self.corpo["questions"]
        for chave, p in perguntas.items():
            self.assertIn(p["type"], ("choice", "noul"), chave)
            self.assertTrue(p["instructions"], chave)
            if p["type"] == "choice":
                self.assertLessEqual(len(p["criteria"]), 255)
        self.assertEqual(set(perguntas["categoria"]["criteria"]), set(automacao.CATEGORIAS_VALIDAS))
        self.assertEqual(set(perguntas["tipo_evento"]["criteria"]) - {j.NENHUM}, set(automacao.TIPOS_EVENTO_VALIDOS))
        self.assertIn(j.NENHUM, perguntas["data_inicio"]["criteria"])
        json.dumps(self.corpo)  # serializável

    def test_atores_conhecidos_ligados_sem_pergunta(self):
        self.assertEqual([a["Nome"] for a in self.candidatos["atores_conhecidos"]], ["Palhoça"])
        self.assertNotIn("Palhoça", self.candidatos["atores_novos"])
        self.assertIn("Gerusa Machado", self.candidatos["atores_novos"])
        self.assertNotIn("Gerusa", self.candidatos["atores_novos"])

    def test_perguntas_referenciam_o_estado(self):
        i = self.candidatos["palavras"].index("Feira") if "Feira" in self.candidatos["palavras"] else 0
        self.assertIn(f"`candidatos_palavras[{i}]`", self.corpo["questions"][f"palavra_{i}"]["instructions"])
        self.assertEqual(self.corpo["state"]["candidatos_atores"], self.candidatos["atores_novos"])
        self.assertIn("dia 13", self.candidatos["datas"])  # data do título entra


def respostas_falsas(candidatos, **sobrescrever):
    r = {
        "categoria": {"type": "choice", "choice": "Cultura, Eventos e Gastronomia", "confidence": 0.82},
        "e_evento": {"type": "noul", "noul": 0.93},
        "tipo_evento": {"type": "choice", "choice": "Feiras e Mercados", "confidence": 0.9},
        "e_pago": {"type": "noul", "noul": 0.1},
        "data_inicio": {"type": "choice", "choice": "dia 13", "confidence": 0.8},
        "data_fim": {"type": "choice", "choice": j.NENHUM, "confidence": 0.7},
        "horario": {"type": "choice", "choice": "10h", "confidence": 0.9},
        "local": {"type": "choice", "choice": "Coqueiros", "confidence": 0.6},
    }
    for i, termo in enumerate(candidatos["palavras"]):
        r[f"palavra_{i}"] = {"type": "noul", "noul": {"Feira": 0.9, "Queijos": 0.8, "Gastronomia": 0.6}.get(termo, 0.1)}
    for i, nome in enumerate(candidatos["atores_novos"]):
        tipo = {"Gerusa Machado": "Pessoa", "Associação dos Moradores de Coqueiros": "Organização"}.get(nome, "nao_entidade")
        r[f"ator_{i}"] = {"type": "choice", "choice": tipo, "confidence": 0.9}
    r.update(sobrescrever)
    return r


class Interpretacao(unittest.TestCase):
    def setUp(self):
        _, self.c = j.montar_requisicao(NOTICIA, ATORES, VOCAB)

    def test_mapeia_respostas_no_formato_do_pipeline(self):
        r = j.interpretar(NOTICIA, respostas_falsas(self.c), self.c)
        self.assertEqual(r["categoria"], "Cultura, Eventos e Gastronomia")
        self.assertTrue(r["e_evento"])
        self.assertEqual(r["tipo_evento"], "Feiras e Mercados")
        self.assertEqual(r["data_evento"], "13/06/2026")
        self.assertIsNone(r["data_fim_evento"])
        self.assertEqual(r["horario_evento"], "10:00")
        self.assertFalse(r["e_pago"])
        self.assertEqual(r["valor_evento"], "R$0,00")
        self.assertEqual(r["palavras_chave"].split(", ")[0], "Feira")
        nomes = {a["nome"]: a["tipo"] for a in r["atores"]}
        self.assertEqual(nomes["Gerusa Machado"], "Pessoa")
        self.assertEqual(nomes["Palhoça"], "Local")  # conhecido
        self.assertNotIn("Coqueiros", nomes)  # marcado como não-entidade no teste
        self.assertIn("presidente", next(a["descricao"] for a in r["atores"] if a["nome"] == "Gerusa Machado"))

    def test_evento_pago_usa_o_valor_escolhido(self):
        r = j.interpretar(NOTICIA, respostas_falsas(self.c, e_pago={"noul": 0.9}, valor={"choice": "R$ 20,00"}), self.c)
        self.assertTrue(r["e_pago"])
        self.assertEqual(r["valor_evento"], "R$20,00")

    def test_nao_evento_ignora_perguntas_especulativas(self):
        r = j.interpretar(NOTICIA, respostas_falsas(self.c, e_evento={"noul": 0.2}, e_pago={"noul": 0.9}), self.c)
        self.assertFalse(r["e_evento"])
        self.assertFalse(r["e_pago"])
        self.assertIsNone(r["valor_evento"])
        processada = {}
        automacao.aplicar_classificacao(processada, r)
        self.assertIsNone(processada["Tipo do Evento"])  # o pipeline zera os campos de evento

    def test_completa_palavras_chave_quando_poucas_passam_o_limiar(self):
        respostas = respostas_falsas(self.c)
        for i in range(len(self.c["palavras"])):
            respostas[f"palavra_{i}"] = {"noul": [0.7, 0.3, 0.25][i] if i < 3 else 0.05}
        self.assertEqual(len(j.interpretar(NOTICIA, respostas, self.c)["palavras_chave"].split(", ")), 3)


class RespostaHTTP:
    def __init__(self, status, corpo=None, headers=None):
        self.status_code, self._corpo, self.headers = status, corpo or {}, headers or {}
        self.ok = 200 <= status < 300
        self.text = json.dumps(self._corpo)

    def json(self):
        return self._corpo


class SessaoFalsa:
    def __init__(self, respostas):
        self.respostas, self.chamadas = list(respostas), []

    def post(self, url, json=None, headers=None, timeout=None):
        self.chamadas.append({"url": url, "json": json, "headers": headers})
        r = self.respostas.pop(0)
        return r(json) if callable(r) else r

    def get(self, url, headers=None, timeout=None):
        return self.respostas.pop(0)


class ClienteHTTP(unittest.TestCase):
    def setUp(self):
        espera = mock.patch.object(j.time, "sleep")  # sem esperas reais nos testes
        espera.start()
        self.addCleanup(espera.stop)

    def test_envia_modelo_estado_e_perguntas_com_autenticacao(self):
        def responder(payload):
            c = j.montar_requisicao(NOTICIA, ATORES, VOCAB)[1]
            return RespostaHTTP(200, {"model": "jev-1.13.0", "answers": respostas_falsas(c)})

        sessao = SessaoFalsa([responder])
        cliente = j.ClassificadorJev("chave-teste", sessao=sessao)
        r = cliente.classificar(NOTICIA, {"atores": ATORES, "vocabulario": VOCAB})
        chamada = sessao.chamadas[0]
        self.assertEqual(chamada["url"], "https://api.typesafe.ai/v1/systemone")
        self.assertEqual(chamada["headers"]["Authorization"], "Bearer chave-teste")
        self.assertEqual(chamada["json"]["model"], "jev-latest")
        self.assertIn("categoria", chamada["json"]["questions"])
        self.assertEqual(r["categoria"], "Cultura, Eventos e Gastronomia")
        self.assertEqual(cliente.modelo_respondente, "jev-1.13.0")

    def test_429_e_5xx_tentam_de_novo(self):
        sessao = SessaoFalsa([RespostaHTTP(429, headers={"retry-after": "1"}), RespostaHTTP(503),
                              RespostaHTTP(200, {"answers": {"categoria": {"choice": "Educação"}}})])
        self.assertEqual(j.ClassificadorJev("k", sessao=sessao).perguntar({})["categoria"]["choice"], "Educação")
        self.assertEqual(len(sessao.chamadas), 3)

    def test_chave_recusada_e_fatal(self):
        with self.assertRaises(j.ErroJev) as ctx:
            j.ClassificadorJev("k", sessao=SessaoFalsa([RespostaHTTP(401)])).perguntar({})
        self.assertTrue(ctx.exception.fatal)
        with self.assertRaises(j.ErroJev) as ctx:
            j.ClassificadorJev("k", sessao=SessaoFalsa([RespostaHTTP(401)])).validar()
        self.assertTrue(ctx.exception.fatal)

    def test_erro_de_requisicao_nao_e_fatal(self):
        with self.assertRaises(j.ErroJev) as ctx:
            j.ClassificadorJev("k", sessao=SessaoFalsa([RespostaHTTP(422, {"detail": "invalid"})])).perguntar({})
        self.assertFalse(ctx.exception.fatal)

    def test_pipeline_completo_com_jev(self):
        pasta = Path(tempfile.mkdtemp())
        (pasta / "noticias.json").write_text(json.dumps([{**NOTICIA, "URL": "u", "Categorias": "Não categorizado", "Palavras-Chaves": "N/A"}]), "utf-8")
        (pasta / "atores.json").write_text(json.dumps(ATORES), "utf-8")

        def responder(payload):
            # Reconstrói os candidatos a partir do estado recebido, como faria a API.
            c = {"palavras": payload["state"]["candidatos_palavras"], "atores_novos": payload["state"]["candidatos_atores"]}
            return RespostaHTTP(200, {"answers": respostas_falsas(c)})

        cliente = j.ClassificadorJev("k", sessao=SessaoFalsa([responder]))
        resumo = automacao.processar(pasta, cliente.classificar, limite_ia=5, pausa=0, coletar=lambda c: [], baixar_noticia=None)
        noticia = json.loads((pasta / "noticias.json").read_text("utf-8"))[0]
        atores = json.loads((pasta / "atores.json").read_text("utf-8"))
        self.assertEqual(resumo["classificadas"], 1)
        self.assertEqual(noticia["Categorias"], "Cultura, Eventos e Gastronomia")
        self.assertEqual(noticia["Data do Evento"], "13/06/2026")
        self.assertTrue(noticia["Atores Extraídos"])
        self.assertIn(900, next(a for a in atores if a["Nome"] == "Palhoça")["Noticias"])
        self.assertTrue(any(a["Nome"] == "Gerusa Machado" and a["Tipo"] == "Pessoa" for a in atores))


if __name__ == "__main__":
    unittest.main()
