// Serve o `dist/` como o Netlify serviria: compressão brotli/gzip, cabeçalhos do
// `netlify.toml` e fallback de SPA. Serve para medir Core Web Vitals (Lighthouse)
// e testar a CSP localmente:  npm run build && node scripts/servir-producao.mjs
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const PORTA = Number(process.env.PORT ?? 4174);
const RAIZ = 'dist';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Regras [[headers]] do netlify.toml: { padrao, valores }. Todas as que casam se somam.
const regras = readFileSync('netlify.toml', 'utf8')
  .split('[[headers]]')
  .slice(1)
  .map((bloco) => ({
    padrao: /for\s*=\s*"([^"]+)"/.exec(bloco)?.[1] ?? '',
    valores: Object.fromEntries(
      [...bloco.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)]
        .filter(([, chave]) => chave !== 'for')
        // Sem HTTPS local: a diretiva faria o navegador reescrever tudo para https.
        .map(([, chave, valor]) => [chave, valor.replace('; upgrade-insecure-requests', '')]),
    ),
  }));
const casa = (padrao, caminho) => (padrao.endsWith('*') ? caminho.startsWith(padrao.slice(0, -1)) : caminho === padrao);

const cache = new Map();
function comprimido(arquivo, codificacao) {
  const chave = `${arquivo}:${codificacao}`;
  if (!cache.has(chave)) {
    const bruto = readFileSync(arquivo);
    cache.set(chave, codificacao === 'br' ? brotliCompressSync(bruto) : gzipSync(bruto));
  }
  return cache.get(chave);
}

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let arquivo = normalize(join(RAIZ, caminho));
  if (!arquivo.startsWith(RAIZ) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) {
    arquivo = join(RAIZ, 'index.html'); // fallback de SPA
  }
  for (const { padrao, valores } of regras) {
    if (casa(padrao, caminho)) for (const [k, v] of Object.entries(valores)) res.setHeader(k, v);
  }
  const tipo = TIPOS[extname(arquivo)] ?? 'application/octet-stream';
  res.setHeader('Content-Type', tipo);
  const aceita = String(req.headers['accept-encoding'] ?? '');
  const compressivel = /text|javascript|json|svg/.test(tipo);
  const codificacao = !compressivel ? null : aceita.includes('br') ? 'br' : aceita.includes('gzip') ? 'gzip' : null;
  if (codificacao) {
    res.setHeader('Content-Encoding', codificacao);
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(comprimido(arquivo, codificacao));
  } else {
    res.end(readFileSync(arquivo));
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`dist/ em http://127.0.0.1:${PORTA} (como no Netlify)`));
