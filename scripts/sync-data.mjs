/**
 * Sincroniza os datasets gerados pelo pipeline Python (raiz do repositório)
 * para `public/data`, de onde o frontend Vite os serve estaticamente.
 *
 * Uso: npm run sync:data
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'data');

const ARQUIVOS = ['noticias.json', 'atores.json'];

await mkdir(destino, { recursive: true });

for (const arquivo of ARQUIVOS) {
  const origem = join(raiz, arquivo);
  try {
    await stat(origem);
  } catch {
    console.warn(`⚠️  ${arquivo} não encontrado na raiz — ignorado.`);
    continue;
  }
  await copyFile(origem, join(destino, arquivo));
  const { size } = await stat(join(destino, arquivo));
  console.log(`✅ ${arquivo} → public/data/ (${(size / 1024 / 1024).toFixed(2)} MB)`);
}
