/**
 * Exportação de tabelas (CSV / XLSX) e gráficos (JPG com fundo / PNG sem fundo),
 * tudo no navegador e sem dependências: o XLSX é um pacote OOXML mínimo num zip
 * sem compressão — o Excel, o LibreOffice e o Google Planilhas abrem normalmente.
 */

export type ValorCelula = string | number | boolean | Date | null | undefined | unknown[];

export interface DadosTabela {
  cabecalhos: string[];
  linhas: ValorCelula[][];
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function baixarArquivo(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  // O clique já iniciou o download; liberar na sequência evita vazar o blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `"Notícias · recorte" → "noticias-recorte-2026-10-04"`. */
export function nomeDeArquivo(base: string, data = new Date()): string {
  const slug = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const dia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  return `${slug || 'dados'}-${dia}`;
}

// ---------------------------------------------------------------------------
// CSV (padrão do Excel em português: `;` e vírgula decimal, UTF-8 com BOM)
// ---------------------------------------------------------------------------

const dataBR = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Valor como texto, no formato brasileiro. */
export function comoTexto(valor: ValorCelula): string {
  if (valor == null) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : dataBR(valor);
  if (Array.isArray(valor)) return valor.map((v) => comoTexto(v as ValorCelula)).join(', ');
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor).replace('.', ',') : '';
  return String(valor);
}

export function gerarCSV({ cabecalhos, linhas }: DadosTabela): string {
  const campo = (texto: string) => (/[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto);
  const corpo = [cabecalhos, ...linhas.map((l) => l.map(comoTexto))].map((l) => l.map(campo).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/** Escapa texto para XML e remove caracteres de controle proibidos. */
const xml = (texto: string) =>
  texto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const letraColuna = (indice: number) => {
  let nome = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) nome = String.fromCharCode(65 + ((n - 1) % 26)) + nome;
  return nome;
};

/** Data → número de série do Excel (dias desde 30/12/1899), pelo dia local. */
const serieExcel = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;

const ESTILO_CABECALHO = 1;
const ESTILO_DATA = 2;

function celula(valor: ValorCelula, ref: string, cabecalho = false): string {
  if (cabecalho) return `<c r="${ref}" t="inlineStr" s="${ESTILO_CABECALHO}"><is><t>${xml(String(valor))}</t></is></c>`;
  if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}"><v>${valor}</v></c>`;
  if (valor instanceof Date && !Number.isNaN(valor.getTime()))
    return `<c r="${ref}" s="${ESTILO_DATA}"><v>${serieExcel(valor)}</v></c>`;
  const texto = comoTexto(valor);
  if (!texto) return '';
  const espaco = /^\s|\s$/.test(texto) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"><is><t${espaco}>${xml(texto)}</t></is></c>`;
}

function planilha({ cabecalhos, linhas }: DadosTabela): string {
  const ultima = letraColuna(Math.max(0, cabecalhos.length - 1));
  // Largura aproximada pelo maior texto da coluna (limitada), como o "autoajuste".
  const larguras = cabecalhos.map((c, i) => {
    const maior = Math.max(c.length, ...linhas.slice(0, 500).map((l) => comoTexto(l[i]).length));
    return Math.min(60, Math.max(8, maior + 2));
  });
  const linhasXml = [cabecalhos, ...linhas].map((linha, r) => {
    const celulas = linha.map((v, c) => celula(v, `${letraColuna(c)}${r + 1}`, r === 0)).join('');
    return `<row r="${r + 1}">${celulas}</row>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // Cabeçalho congelado e autofiltro: a planilha já abre pronta para explorar.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${linhasXml.join('')}</sheetData>` +
    `<autoFilter ref="A1:${ultima}${linhas.length + 1}"/>` +
    '</worksheet>'
  );
}

const ARQUIVOS_FIXOS: Record<string, string> = {
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>' +
    '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Dados!$A$1:$A$1</definedName></definedNames></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
};

export function gerarXLSX(dados: DadosTabela): Uint8Array<ArrayBuffer> {
  const ultima = letraColuna(Math.max(0, dados.cabecalhos.length - 1));
  const arquivos = {
    ...ARQUIVOS_FIXOS,
    // O nome definido amarra o autofiltro ao intervalo real da planilha.
    'xl/workbook.xml': ARQUIVOS_FIXOS['xl/workbook.xml'].replace('$A$1:$A$1', `$A$1:$${ultima}$${dados.linhas.length + 1}`),
    'xl/worksheets/sheet1.xml': planilha(dados),
  };
  return zipSemCompressao(Object.entries(arquivos).map(([nome, texto]) => [nome, new TextEncoder().encode(texto)]));
}

// --- Zip "stored" (sem compressão): cabeçalhos locais + diretório central ---

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = TABELA_CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipSemCompressao(arquivos: Array<[string, Uint8Array]>): Uint8Array<ArrayBuffer> {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  const DATA_DOS = 0x5b84; // data fixa (formato DOS): o arquivo não depende do relógio
  for (const [nome, dados] of arquivos) {
    const nomeBytes = new TextEncoder().encode(nome);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // método: armazenado
    local.setUint16(10, 0, true);
    local.setUint16(12, DATA_DOS, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeBytes.length, true);
    partes.push(new Uint8Array(local.buffer), nomeBytes, dados);

    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true);
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(14, DATA_DOS, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, dados.length, true);
    entrada.setUint32(24, dados.length, true);
    entrada.setUint16(28, nomeBytes.length, true);
    entrada.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(entrada.buffer), nomeBytes);
    deslocamento += 30 + nomeBytes.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

export function baixarTabela(dados: DadosTabela, formato: 'csv' | 'xlsx', base: string): void {
  const nome = nomeDeArquivo(base);
  if (formato === 'csv') baixarArquivo(new Blob([gerarCSV(dados)], { type: 'text/csv;charset=utf-8' }), `${nome}.csv`);
  else
    baixarArquivo(
      new Blob([gerarXLSX(dados)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${nome}.xlsx`,
    );
}

// ---------------------------------------------------------------------------
// Gráficos → imagem
// ---------------------------------------------------------------------------

export interface OpcoesImagem {
  titulo?: string;
  legenda?: Array<{ nome: string; cor: string; valor?: string | number }>;
  /** Cores do tema atual (texto do título/legenda e fundo do JPG). */
  fundo: string;
  texto: string;
  textoSecundario: string;
}

const ESCALA = 2; // nitidez de tela retina / impressão

/** Desenha o conteúdo visual do elemento num canvas: canvas, SVG ou texto (nuvem). */
async function capturar(el: HTMLElement): Promise<HTMLCanvasElement> {
  const caixa = el.getBoundingClientRect();
  const saida = document.createElement('canvas');
  const ctx = saida.getContext('2d')!;

  const canvas = el.querySelector('canvas');
  if (canvas) {
    // vis-network já desenha na resolução do dispositivo: copia como está.
    saida.width = canvas.width;
    saida.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
    return saida;
  }

  saida.width = Math.round(caixa.width * ESCALA);
  saida.height = Math.round(caixa.height * ESCALA);
  ctx.scale(ESCALA, ESCALA);

  const svg = el.querySelector<SVGSVGElement>('svg.recharts-surface') ?? el.querySelector('svg');
  if (svg && !el.hasAttribute('data-exportar-texto')) {
    const caixaSvg = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(caixaSvg.width));
    clone.setAttribute('height', String(caixaSvg.height));
    const imagem = new Image();
    imagem.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    await imagem.decode();
    ctx.drawImage(imagem, caixaSvg.left - caixa.left, caixaSvg.top - caixa.top, caixaSvg.width, caixaSvg.height);
    return saida;
  }

  // Texto posicionado pelo navegador (nuvem de termos): redesenha cada palavra
  // na mesma posição, fonte e cor.
  ctx.textBaseline = 'middle';
  for (const item of el.querySelectorAll<HTMLElement>('[data-palavra]')) {
    const r = item.getBoundingClientRect();
    const estilo = getComputedStyle(item);
    ctx.font = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
    ctx.fillStyle = estilo.color;
    ctx.fillText(item.textContent ?? '', r.left - caixa.left + parseFloat(estilo.paddingLeft), r.top - caixa.top + r.height / 2);
  }
  return saida;
}

/** Monta a imagem final: título, gráfico e legenda; fundo só no JPG. */
function compor(grafico: HTMLCanvasElement, opcoes: OpcoesImagem, comFundo: boolean): HTMLCanvasElement {
  const m = 24 * ESCALA;
  const fonte = (peso: number, px: number) => `${peso} ${px * ESCALA}px Manrope, system-ui, sans-serif`;
  const largura = grafico.width + m * 2;
  const medidor = document.createElement('canvas').getContext('2d')!;

  // Legenda em linhas que quebram na largura disponível.
  medidor.font = fonte(500, 12);
  const linhasLegenda: Array<Array<{ texto: string; cor: string; largura: number }>> = [[]];
  let ocupado = 0;
  for (const item of opcoes.legenda ?? []) {
    const texto = item.valor !== undefined ? `${item.nome}  ${item.valor}` : item.nome;
    const w = 16 * ESCALA + medidor.measureText(texto).width + 20 * ESCALA;
    if (ocupado + w > largura - m * 2 && ocupado > 0) {
      linhasLegenda.push([]);
      ocupado = 0;
    }
    linhasLegenda[linhasLegenda.length - 1].push({ texto, cor: item.cor, largura: w });
    ocupado += w;
  }
  // Título quebrado em linhas que cabem na largura (gráficos estreitos no celular).
  medidor.font = fonte(600, 15);
  const linhasTitulo: string[] = [];
  for (const palavra of (opcoes.titulo ?? '').split(' ').filter(Boolean)) {
    const atual = linhasTitulo[linhasTitulo.length - 1];
    if (atual !== undefined && medidor.measureText(`${atual} ${palavra}`).width <= largura - m * 2) {
      linhasTitulo[linhasTitulo.length - 1] = `${atual} ${palavra}`;
    } else linhasTitulo.push(palavra);
  }
  const alturaTitulo = linhasTitulo.length ? linhasTitulo.length * 21 * ESCALA + 9 * ESCALA : 0;
  const alturaLegenda = opcoes.legenda?.length ? linhasLegenda.length * 22 * ESCALA + 12 * ESCALA : 0;

  const saida = document.createElement('canvas');
  saida.width = largura;
  saida.height = m + alturaTitulo + grafico.height + alturaLegenda + m;
  const ctx = saida.getContext('2d')!;
  if (comFundo) {
    ctx.fillStyle = opcoes.fundo;
    ctx.fillRect(0, 0, saida.width, saida.height);
  }
  ctx.textBaseline = 'top';
  ctx.font = fonte(600, 15);
  ctx.fillStyle = opcoes.texto;
  linhasTitulo.forEach((linha, i) => ctx.fillText(linha, m, m + i * 21 * ESCALA));
  ctx.drawImage(grafico, m, m + alturaTitulo);

  let y = m + alturaTitulo + grafico.height + 12 * ESCALA;
  ctx.font = fonte(500, 12);
  ctx.textBaseline = 'middle';
  for (const linha of opcoes.legenda?.length ? linhasLegenda : []) {
    let x = m;
    for (const item of linha) {
      ctx.fillStyle = item.cor;
      ctx.beginPath();
      ctx.arc(x + 5 * ESCALA, y + 8 * ESCALA, 4 * ESCALA, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = opcoes.textoSecundario;
      ctx.fillText(item.texto, x + 16 * ESCALA, y + 8 * ESCALA);
      x += item.largura;
    }
    y += 22 * ESCALA;
  }
  return saida;
}

export async function baixarGrafico(el: HTMLElement, formato: 'jpg' | 'png', base: string, opcoes: OpcoesImagem) {
  const imagem = compor(await capturar(el), opcoes, formato === 'jpg');
  const tipo = formato === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((ok) => imagem.toBlob(ok, tipo, 0.92));
  if (blob) baixarArquivo(blob, `${nomeDeArquivo(base)}.${formato}`);
}
