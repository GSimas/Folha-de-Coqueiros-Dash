import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from '@/components/Markdown';
import { ProvedorPerfis, type ContextoPerfis } from '@/lib/perfis';
import { criarDicionario, hrefDePerfil, lerHrefDePerfil } from '@/lib/entidades';
import type { Ator, Noticia } from '@/types';

const atores = [
  { id: 1, nome: 'Gerusa Machado', tipo: 'Pessoa', descricao: '', noticias: [1] },
  { id: 2, nome: 'Centro de Saúde de Coqueiros', tipo: 'Organização', descricao: '', noticias: [1] },
  { id: 3, nome: 'Vacina', tipo: 'Organização', descricao: '', noticias: [1] }, // homônimo de tema: ator vence
] as Ator[];
const noticia = (palavrasChaves: string[]) => ({ palavrasChaves }) as Noticia;
const noticias = [noticia(['Vacinação', 'Centro de Saúde', 'Vacina']), noticia(['vacinação', 'Centro de Saúde']), noticia(['Raro'])];
const dicionario = criarDicionario(atores, noticias);

const perfis: ContextoPerfis = {
  abrirAtor: () => {},
  abrirTema: () => {},
  abrirCategoria: () => {},
  abrirTipoEvento: () => {},
  pesquisar: () => {},
  verCategoria: () => {},
  idDoAtor: (nome) => atores.find((a) => a.nome.toLowerCase() === nome.toLowerCase())?.id,
};
const html = (texto: string) =>
  renderToStaticMarkup(
    <ProvedorPerfis value={perfis}>
      <Markdown texto={texto} entidades={dicionario} />
    </ProvedorPerfis>,
  );
const links = (saida: string) => [...saida.matchAll(/title="Abrir o perfil d[oa] ([^"]+?) “([^”]+)”"[^>]*>([^<]+)</g)].map((m) => `${m[1]}:${m[2]}=${m[3]}`);

describe('menções viram links de perfil', () => {
  it('dicionário: ator tem prioridade, temas raros ficam de fora', () => {
    expect(dicionario.porChave.get('vacina')?.tipo).toBe('ator');
    expect(dicionario.porChave.get('vacinação')?.tipo).toBe('tema');
    expect(dicionario.porChave.has('raro')).toBe(false); // só 1 notícia
    expect(dicionario.porChave.get('saúde e bem-estar')?.tipo).toBe('categoria');
    expect(criarDicionario([], [noticia(['Eventos']), noticia(['Eventos'])]).porChave.has('eventos')).toBe(false);
    expect(lerHrefDePerfil(hrefDePerfil('tema', 'Saúde & Cia'))).toEqual({ tipo: 'tema', nome: 'Saúde & Cia' });
  });

  it('linka a primeira menção de cada entidade, preferindo o nome mais longo', () => {
    const saida = html('A **Gerusa Machado** falou no Centro de Saúde de Coqueiros sobre vacinação. Gerusa Machado repetiu: Saúde e Bem-estar e Feiras e Mercados.');
    expect(links(saida)).toEqual([
      'ator:Gerusa Machado=Gerusa Machado',
      'ator:Centro de Saúde de Coqueiros=Centro de Saúde de Coqueiros',
      'tema:Vacinação=vacinação',
      'categoria:Saúde e Bem-estar=Saúde e Bem-estar',
      'tipo de evento:Feiras e Mercados=Feiras e Mercados',
    ]);
  });

  it('não mexe em links existentes, código nem partes de palavras', () => {
    const saida = html('[Centro de Saúde](https://x) e `Vacina` e Vacinas.');
    expect(links(saida)).toEqual([]);
  });

  it('funciona dentro de tabelas', () => {
    expect(links(html('| Ator | N |\n|---|--:|\n| Gerusa Machado | 3 |'))).toEqual(['ator:Gerusa Machado=Gerusa Machado']);
  });

  it('sem o provedor de perfis (fora do painel), mostra texto simples', () => {
    const saida = renderToStaticMarkup(<Markdown texto="Gerusa Machado" entidades={dicionario} />);
    expect(saida).not.toContain('Abrir o perfil');
    expect(saida).toContain('Gerusa Machado');
  });
});
