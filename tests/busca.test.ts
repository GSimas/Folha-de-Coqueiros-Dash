import { describe, expect, it } from 'vitest';
import { buscarNoAcervo, casaComBusca, criarIndiceBusca, realcar } from '@/lib/busca';
import { atores, noticias } from './apoio';

const indice = criarIndiceBusca(noticias, atores);

describe('busca global', () => {
  it('ignora acento e caixa e prioriza o título', () => {
    const r = buscarNoAcervo(indice, 'SAUDE')!;
    expect(r.noticias.length).toBeGreaterThan(0);
    expect(r.noticias[0].noticia.titulo.toLowerCase()).toContain('saúde');
    expect(r.categorias.map((c) => c.nome)).toContain('Saúde e Bem-estar');
  });

  it('encontra atores e conta as notícias como o filtro do acervo', () => {
    const r = buscarNoAcervo(indice, 'pro-coqueiros')!;
    expect(r.atores.some((a) => a.nome.includes('Pró-Coqueiros'))).toBe(true);
    expect(r.totalNoticias).toBe(noticias.filter((n) => casaComBusca(n, ['pro-coqueiros'])).length);
    const varias = buscarNoAcervo(indice, 'saúde vila')!;
    expect(varias.totalNoticias).toBe(noticias.filter((n) => casaComBusca(n, ['saude', 'vila'])).length);
    expect(varias.totalNoticias).toBeGreaterThanOrEqual(varias.noticias.length);
  });

  it('consulta vazia ou curta não busca; consulta sem par devolve listas vazias', () => {
    expect(buscarNoAcervo(indice, ' a ')).toBeNull();
    const r = buscarNoAcervo(indice, 'xyzqwk')!;
    expect([r.noticias, r.atores, r.termos, r.categorias].every((l) => l.length === 0)).toBe(true);
  });

  it('realça os trechos que casam, preservando o texto original', () => {
    const partes = realcar('Feira de Saúde', ['saude']);
    expect(partes.map((p) => p.texto).join('')).toBe('Feira de Saúde');
    expect(partes.find((p) => p.marcado)?.texto).toBe('Saúde');
  });
});
