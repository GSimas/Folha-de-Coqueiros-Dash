import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from '@/components/Markdown';

const html = (texto: string, urls?: string[]) =>
  renderToStaticMarkup(<Markdown texto={texto} urlsVerificadas={urls ? new Set(urls) : undefined} />);

const URL_ACERVO = 'https://folhadecoqueiros.com.br/materia';

describe('Markdown das respostas', () => {
  it('renderiza os elementos GFM', () => {
    const saida = html(
      [
        '## Título',
        '**negrito** *itálico* ~~tachado~~ `código`',
        '1. um\n2. dois\n   - aninhado',
        '- [x] feito\n- [ ] pendente',
        '> citação',
        '```json\n{"a": 1}\n```',
        '---',
        'https://folhadecoqueiros.com.br/materia',
      ].join('\n\n'),
      [URL_ACERVO],
    );
    for (const trecho of ['<h2>', '<strong>', '<em>', '<del>', '<code>', '<ol>', '<ul', 'type="checkbox"', '<blockquote>', '<pre>', '<hr/>']) {
      expect(saida).toContain(trecho);
    }
    expect(saida).toContain(`href="${URL_ACERVO}"`); // autolink
  });

  it('tabelas viram tabela interativa, com alinhamento e tipos inferidos', () => {
    const saida = html('| Ano | Notícias | Categoria |\n|:--|--:|:--|\n| 2022 | 1.237 | Cultura |\n| 2023 | 174 | Cultura |\n| 2024 | 200 | Saúde |');
    expect(saida).toContain('<table');
    expect(saida).toContain('Ordenar por Ano');
    expect(saida).toContain('Filtrar Notícias');
    expect(saida).toContain('1.237');
    expect((saida.match(/<tr/g) ?? []).length).toBe(4);
  });

  it('descarta HTML cru e esquemas perigosos', () => {
    const saida = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) <b>cru</b>');
    expect(saida).not.toMatch(/<script|onerror|javascript:|<b>/i);
  });

  it('não carrega imagens externas (pixel de rastreamento)', () => {
    const saida = html('![pixel](https://rastreador.exemplo/p.gif)');
    expect(saida).not.toContain('<img');
    expect(saida).toContain('[imagem: pixel]');
  });

  it('links fora das fontes enviadas aparecem como não verificados', () => {
    const saida = html(`[real](${URL_ACERVO}) e [inventado](https://exemplo.com/falso)`, [URL_ACERVO]);
    expect(saida).toContain(`href="${URL_ACERVO}"`);
    expect(saida).not.toContain('href="https://exemplo.com/falso"');
    expect(saida).toContain('link não verificado');
  });

  it('links dentro de tabelas também passam pela verificação', () => {
    const saida = html(`| Fonte |\n|---|\n| [ok](${URL_ACERVO}) |\n| [falso](https://exemplo.com) |`, [URL_ACERVO]);
    expect(saida).toContain(`href="${URL_ACERVO}"`);
    expect(saida).not.toContain('href="https://exemplo.com"');
  });

  it('markdown incompleto (resposta cortada) não quebra a renderização', () => {
    expect(() => html('| A | B |\n|---|---|\n| 1 | [Leia mais](https://folhadecoqueiros.com.br/mobili')).not.toThrow();
    expect(() => html('**negrito sem fim e `código sem fim')).not.toThrow();
  });
});
