"""Testes da coleta/classificação. Rode com:  python3 -m unittest tests/test_automacao.py"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import automacao as a  # noqa: E402

HTML_NOTICIA = """
<html><head><meta property="og:title" content="Título OG"></head><body>
<h1 class="elementor-heading-title">Feira de queijos no sábado</h1>
<span class="elementor-post-info__item--type-date">13/09/2026</span>
<div class="elementor-widget-theme-post-content"><p>A feira acontece na praça.</p><p>Entrada gratuita.</p></div>
</body></html>
"""


class Extracao(unittest.TestCase):
    def test_extrai_campos_do_tema_atual(self):
        n = a.extrair_noticia(HTML_NOTICIA.encode(), "https://x/feira")
        self.assertEqual(n["Título"], "Feira de queijos no sábado")
        self.assertEqual(n["Data"], "13/09/2026")
        self.assertIn("Entrada gratuita.", n["Conteúdo"])
        self.assertEqual(n["Categorias"], "Não categorizado")

    def test_alternativas_quando_o_tema_muda(self):
        html = '<h1>Outro título</h1><time datetime="2026-09-28T10:00:00">28 set</time><article><p>Texto</p></article>'
        n = a.extrair_noticia(html.encode(), "u")
        self.assertEqual((n["Título"], n["Data"]), ("Outro título", "28/09/2026"))

    def test_pagina_irreconhecivel_falha_explicitamente(self):
        with self.assertRaises(ValueError):
            a.extrair_noticia(b"<html><body>nada</body></html>", "u")

    def test_links_da_listagem_sem_duplicatas(self):
        html = "".join(f'<article><a href="https://s/{i % 3}/">x</a></article>' for i in range(9))
        self.assertEqual(len(a.links_da_listagem(html.encode())), 3)


class ValidacaoIA(unittest.TestCase):
    def test_extrai_json_com_cercas_e_texto(self):
        self.assertEqual(a.extrair_json('Claro!\n```json\n{"categoria": "Educação"}\n```'), {"categoria": "Educação"})
        with self.assertRaises(a.ErroIA):
            a.extrair_json("sem json")

    def test_corresponde_categoria_tolerando_acento_e_caixa(self):
        self.assertEqual(a.corresponder("saude e bem-estar", a.CATEGORIAS_VALIDAS), "Saúde e Bem-estar")
        self.assertEqual(a.corresponder("Cultura", a.CATEGORIAS_VALIDAS), "Cultura, Eventos e Gastronomia")
        self.assertIsNone(a.corresponder("Astrologia", a.CATEGORIAS_VALIDAS))

    def test_aplica_e_valida_campos(self):
        n = {"Categorias": "Não categorizado"}
        a.aplicar_classificacao(
            n,
            {
                "categoria": "Inventada",
                "palavras_chave": ["feira", "queijo"],
                "e_evento": "true",
                "tipo_evento": "feiras e mercados",
                "data_evento": "13/09/2026",
                "data_fim_evento": "amanhã",
                "horario_evento": "9h",
                "e_pago": False,
                "valor_evento": "R$0,00",
            },
        )
        self.assertEqual(n["Categorias"], "Comunidade e Sociedade")  # inválida → genérica
        self.assertEqual(n["Palavras-Chaves"], "feira, queijo")
        self.assertTrue(n["É Evento"])
        self.assertEqual(n["Tipo do Evento"], "Feiras e Mercados")
        self.assertEqual(n["Data do Evento"], "13/09/2026")
        self.assertIsNone(n["Data Fim Evento"])  # formato inválido descartado
        self.assertIsNone(n["Horário do Evento"])

    def test_campos_de_evento_zerados_quando_nao_e_evento(self):
        n = {}
        a.aplicar_classificacao(n, {"categoria": "Educação", "e_evento": False, "local_evento": "Escola", "e_pago": True})
        self.assertFalse(n["É Evento"])
        self.assertFalse(n["É Pago"])
        self.assertIsNone(n["Local do Evento"])


class Atores(unittest.TestCase):
    def test_funde_por_nome_normalizado_e_tipo(self):
        base = [{"ID_Ator": 0, "Nome": "Associação Pró-Coqueiros", "Tipo": "Organização", "Descricao": "", "Noticias": [1]}]
        novos = a.sincronizar_atores(
            base,
            [
                {"nome": "associacao pro-coqueiros", "tipo": "organizacao", "descricao": "x"},
                {"nome": "Maria  Silva", "tipo": "Pessoa", "descricao": "moradora"},
                {"nome": "X", "tipo": "Pessoa"},  # curto demais
                {"nome": "Algo", "tipo": "Planeta"},  # tipo inválido
                "lixo",
            ],
            id_noticia=7,
        )
        self.assertEqual(novos, 1)
        self.assertEqual(base[0]["Noticias"], [1, 7])
        self.assertEqual(base[1]["Nome"], "Maria Silva")
        self.assertEqual(base[1]["ID_Ator"], 1)

    def test_pendencias_respeitam_o_historico(self):
        noticias = [
            {"ID": 1, "Categorias": "Educação", "Palavras-Chaves": "a"},  # antiga, sem atores: ok
            {"ID": 2, "Categorias": "Educação", "Palavras-Chaves": "a"},  # ligada a ator: ok
            {"ID": 3, "Categorias": "Educação", "Palavras-Chaves": "a"},  # nova sem atores: pendente
            {"ID": 4, "Categorias": "Não categorizado", "Palavras-Chaves": "N/A"},  # pendente
            {"ID": 5, "Categorias": "Educação", "Palavras-Chaves": "a", "Atores Extraídos": True},  # ok
        ]
        atores = [{"Nome": "A", "Tipo": "Pessoa", "Noticias": [2]}]
        self.assertEqual([n["ID"] for n in a.pendencias(noticias, atores)], [4, 3])

    def test_lote_parcial_nao_esconde_as_restantes(self):
        noticias = [{"ID": i, "Categorias": "Educação", "Palavras-Chaves": "a"} for i in range(1, 6)]
        for n in noticias[3:]:
            n["Atores Extraídos"] = True  # 4 e 5 já processadas neste lote
        atores = [{"Nome": "A", "Tipo": "Pessoa", "Noticias": [1, 5]}]
        self.assertEqual([n["ID"] for n in a.pendencias(noticias, atores)], [3, 2])


class FluxoCompleto(unittest.TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp())
        (self.pasta / "noticias.json").write_text(
            json.dumps([{"ID": 10, "URL": "https://s/antiga/", "Título": "Antiga", "Data": "01/01/2026", "Conteúdo": "c",
                         "Categorias": "Educação", "Palavras-Chaves": "a"}]),
            "utf-8",
        )
        (self.pasta / "atores.json").write_text(json.dumps([{"ID_Ator": 0, "Nome": "A", "Tipo": "Pessoa", "Descricao": "", "Noticias": [10]}]), "utf-8")
        self.coletar = lambda conhecidas: [u for u in ["https://s/antiga", "https://s/nova-1/", "https://s/quebrada/"] if a.normalizar_url(u) not in conhecidas]

    def baixar(self, url):
        if "quebrada" in url:
            raise ValueError("estrutura da página não reconhecida")
        return a.extrair_noticia(HTML_NOTICIA.encode(), url)

    def ler(self, nome):
        return json.loads((self.pasta / nome).read_text("utf-8"))

    def test_coleta_classifica_e_extrai_atores(self):
        ia = lambda n, _c: {"categoria": "Cultura, Eventos e Gastronomia", "palavras_chave": "feira", "e_evento": True,
                        "tipo_evento": "Feiras e Mercados", "atores": [{"nome": "Praça XV", "tipo": "Local", "descricao": "local"}]}
        resumo = a.processar(self.pasta, ia, limite_ia=10, pausa=0, coletar=self.coletar, baixar_noticia=self.baixar)
        noticias, atores = self.ler("noticias.json"), self.ler("atores.json")
        self.assertEqual((resumo["coletadas"], resumo["falhas_coleta"], resumo["classificadas"]), (1, 1, 1))
        self.assertEqual(noticias[0]["ID"], 11)  # nova entra no topo com o próximo ID
        self.assertEqual(noticias[0]["Categorias"], "Cultura, Eventos e Gastronomia")
        self.assertTrue(noticias[0]["Atores Extraídos"])
        self.assertEqual(atores[-1]["Nome"], "Praça XV")
        self.assertEqual(atores[-1]["Noticias"], [11])
        self.assertEqual(resumo["pendentes"], 0)

    def test_chave_invalida_interrompe_mas_salva_a_coleta(self):
        def ia(_n, _c):
            raise a.ErroIA("chave recusada", fatal=True)

        resumo = a.processar(self.pasta, ia, limite_ia=10, pausa=0, coletar=self.coletar, baixar_noticia=self.baixar)
        self.assertEqual(resumo["erro_fatal"], "chave recusada")
        self.assertEqual(len(self.ler("noticias.json")), 2)  # coleta preservada
        self.assertEqual(resumo["pendentes"], 1)

    def test_falha_pontual_nao_impede_as_demais(self):
        chamadas = []

        def ia(n, _c):
            chamadas.append(n["ID"])
            if len(chamadas) == 1:
                raise a.ErroIA("JSON inválido")
            return {"categoria": "Educação", "palavras_chave": "x", "atores": []}

        # Duas pendentes: a nova (falha) e uma antiga sem classificação (sucesso).
        dados = self.ler("noticias.json")
        dados[0]["Categorias"] = "Não categorizado"
        (self.pasta / "noticias.json").write_text(json.dumps(dados), "utf-8")
        resumo = a.processar(self.pasta, ia, limite_ia=10, pausa=0, coletar=self.coletar, baixar_noticia=self.baixar)
        self.assertEqual((resumo["classificadas"], resumo["falhas_ia"], resumo["pendentes"]), (1, 1, 1))

    def test_limite_por_execucao(self):
        dados = [{"ID": i, "URL": f"u{i}", "Título": "t", "Data": "", "Conteúdo": "c", "Categorias": "Não categorizado", "Palavras-Chaves": "N/A"} for i in range(5)]
        (self.pasta / "noticias.json").write_text(json.dumps(dados), "utf-8")
        resumo = a.processar(self.pasta, lambda n, _c: {"categoria": "Educação", "palavras_chave": "x"}, limite_ia=2, pausa=0,
                             coletar=lambda c: [], baixar_noticia=self.baixar)
        self.assertEqual((resumo["classificadas"], resumo["pendentes"]), (2, 3))


if __name__ == "__main__":
    unittest.main()
