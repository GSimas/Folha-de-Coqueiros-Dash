import { describe, expect, it } from 'vitest';
import { montarPerfil, montarPerfilCategoria, montarPerfilTema, montarPerfilTipoEvento } from '@/lib/perfil';
import { atores, noticias } from './apoio';

const porId = new Map(noticias.map((n) => [n.id, n]));
const maisCitado = [...atores].sort((a, b) => b.citacoes - a.citacoes)[0];

describe('perfil de ator', () => {
  const perfil = montarPerfil(maisCitado, porId, atores);

  it('reúne as notícias do ator, da mais recente para a mais antiga', () => {
    expect(perfil.noticias.length).toBe(maisCitado.noticias.filter((id) => porId.has(id)).length);
    const tempos = perfil.noticias.map((n) => n.dataConvertida?.getTime() ?? 0);
    expect(tempos).toEqual([...tempos].sort((a, b) => b - a));
    expect(perfil.posicaoCitacoes).toBe(1);
  });

  it('série mensal contínua soma as notícias datadas', () => {
    const datadas = perfil.noticias.filter((n) => n.mesAno).length;
    expect(perfil.serie.reduce((s, m) => s + m.total, 0)).toBe(datadas);
    expect(perfil.serie[0].mesAno).toBe(perfil.primeira!.mesAno);
    expect(perfil.serie.at(-1)!.mesAno).toBe(perfil.ultima!.mesAno);
  });

  it('conexões contam notícias em comum e batem com o grau', () => {
    expect(perfil.conexoes.length).toBe(maisCitado.grauAbsoluto);
    const { ator, emComum } = perfil.conexoes[0];
    expect(ator.noticias.filter((id) => maisCitado.noticias.includes(id)).length).toBe(emComum);
    expect(perfil.conexoes.some((c) => c.ator.id === maisCitado.id)).toBe(false);
  });
});

describe('perfil de tema', () => {
  const chave = noticias.find((n) => n.palavrasChaves.length > 0)!.palavrasChaves[0];

  it('reúne notícias em que o termo é palavra-chave, sem diferenciar caixa/acento', () => {
    const perfil = montarPerfilTema(chave.toUpperCase(), noticias, atores);
    expect(perfil.comoPalavraChave).toBeGreaterThan(0);
    expect(perfil.noticias.length).toBeGreaterThanOrEqual(perfil.comoPalavraChave);
    expect(perfil.nome.toLowerCase()).toBe(chave.toLowerCase());
    expect(perfil.temas.every((r) => r.termo.toLowerCase() !== chave.toLowerCase())).toBe(true);
  });

  it('termo da nuvem (só no texto) casa palavra inteira', () => {
    const perfil = montarPerfilTema('praia', noticias, atores);
    expect(perfil.noticias.length).toBeGreaterThan(0);
    expect(perfil.noticias.every((n) => /(^|[^\p{L}])praia(?![\p{L}])/iu.test(`${n.titulo} ${n.conteudo} ${n.palavrasChaves.join(' ')}`))).toBe(true);
    expect(perfil.fracaoAcervo).toBeCloseTo(perfil.noticias.length / noticias.length);
  });

  it('atores envolvidos estão em notícias do tema', () => {
    const perfil = montarPerfilTema('saúde', noticias, atores);
    const ids = new Set(perfil.noticias.map((n) => n.id));
    expect(perfil.atores.length).toBeGreaterThan(0);
    expect(perfil.atores.every(({ ator, emComum }) => ator.noticias.filter((id) => ids.has(id)).length === emComum)).toBe(true);
  });
});

describe('perfis de categoria e tipo de evento', () => {
  it('categoria reúne só as notícias dela, com tipos dos seus eventos', () => {
    const perfil = montarPerfilCategoria('Saúde e Bem-estar', noticias, atores);
    expect(perfil.noticias.length).toBe(noticias.filter((n) => n.categorias === 'Saúde e Bem-estar').length);
    expect(perfil.tiposEvento.reduce((s, t) => s + t.total, 0)).toBe(perfil.eventos.filter((e) => e.tipoEvento).length);
  });

  it('tipo de evento reúne só eventos desse tipo, com locais', () => {
    const tipo = noticias.find((n) => n.ehEvento && n.tipoEvento)!.tipoEvento!;
    const perfil = montarPerfilTipoEvento(tipo, noticias, atores);
    expect(perfil.noticias.length).toBeGreaterThan(0);
    expect(perfil.noticias.every((n) => n.ehEvento && n.tipoEvento === tipo)).toBe(true);
    expect(perfil.tiposEvento).toEqual([{ nome: tipo, total: perfil.noticias.length }]);
  });
});
