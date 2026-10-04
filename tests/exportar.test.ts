import { describe, expect, it } from 'vitest';
import { crc32, gerarCSV, gerarXLSX, nomeDeArquivo, type DadosTabela } from '@/lib/exportar';

const dados: DadosTabela = {
  cabecalhos: ['Nome', 'Citações', 'Data', 'Temas', 'Evento'],
  linhas: [
    ['Pró-Coqueiros; "associação"', 48, new Date(2026, 8, 28), ['Saúde', 'Vila'], true],
    ['A & B <teste>', 0.13, undefined, [], false],
  ],
};

/** Lê um zip "stored" pelos cabeçalhos locais: { nome → conteúdo }. */
function lerZip(bytes: Uint8Array): Record<string, { texto: string; crcOk: boolean }> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const arquivos: Record<string, { texto: string; crcOk: boolean }> = {};
  let pos = 0;
  while (v.getUint32(pos, true) === 0x04034b50) {
    expect(v.getUint16(pos + 8, true)).toBe(0); // armazenado
    const crc = v.getUint32(pos + 14, true);
    const tamanho = v.getUint32(pos + 18, true);
    const tamNome = v.getUint16(pos + 26, true);
    const nome = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + tamNome));
    const conteudo = bytes.subarray(pos + 30 + tamNome, pos + 30 + tamNome + tamanho);
    arquivos[nome] = { texto: new TextDecoder().decode(conteudo), crcOk: crc32(conteudo) === crc };
    pos += 30 + tamNome + tamanho;
  }
  expect(v.getUint32(bytes.length - 22, true)).toBe(0x06054b50); // fim do diretório central
  return arquivos;
}

describe('exportação de tabelas', () => {
  it('CSV no padrão do Excel em português: BOM, ";", vírgula decimal, aspas escapadas', () => {
    const csv = gerarCSV(dados);
    expect(csv.startsWith('﻿Nome;Citações;Data;Temas;Evento\r\n')).toBe(true);
    expect(csv).toContain('"Pró-Coqueiros; ""associação""";48;28/09/2026;Saúde, Vila;Sim');
    expect(csv).toContain('A & B <teste>;0,13;;;Não');
  });

  it('CRC-32 confere com o valor de referência', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('XLSX é um pacote OOXML válido com tipos, datas e texto escapado', () => {
    const zip = lerZip(gerarXLSX(dados));
    expect(Object.keys(zip).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    );
    expect(Object.values(zip).every((a) => a.crcOk)).toBe(true);
    const folha = zip['xl/worksheets/sheet1.xml'].texto;
    expect(folha).toContain('<c r="A1" t="inlineStr" s="1"><is><t>Nome</t></is></c>');
    expect(folha).toContain('<c r="B2"><v>48</v></c>'); // número de verdade
    expect(folha).toContain('<c r="C2" s="2"><v>46293</v></c>'); // 28/09/2026 como data do Excel
    expect(folha).toContain('Pró-Coqueiros; &quot;associação&quot;');
    expect(folha).toContain('A &amp; B &lt;teste&gt;');
    expect(folha).toContain('<autoFilter ref="A1:E3"/>');
    expect(zip['xl/workbook.xml'].texto).toContain('Dados!$A$1:$E$3');
    for (const { texto } of Object.values(zip)) expect(() => new DOMParserLike(texto)).not.toThrow();
  });

  it('nome de arquivo sem acentos nem símbolos, com a data', () => {
    expect(nomeDeArquivo('Notícias · recorte do acervo', new Date(2026, 9, 4))).toBe('noticias-recorte-do-acervo-2026-10-04');
  });
});

/** Checagem leve de XML bem formado (tags abertas = fechadas) sem DOM no ambiente de teste. */
class DOMParserLike {
  constructor(texto: string) {
    const pilha: string[] = [];
    for (const [, fecha, nome, autoFecha] of texto.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
      if (autoFecha) continue;
      if (fecha) {
        if (pilha.pop() !== nome) throw new Error(`XML malformado em </${nome}>`);
      } else pilha.push(nome);
    }
    if (pilha.length) throw new Error('XML com tags abertas');
  }
}
