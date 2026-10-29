// servidor.mjs — serve o projeto em http://localhost:3000 (npm start).
//
// Sem dependências: só o Node. A raiz lista as peças de pecas/ com a
// primeira linha do README de cada uma; o resto é arquivo estático.
// Porta: PORT=8080 npm start
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = Number(process.env.PORT) || 3000;

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

async function pecas() {
    const nomes = (await readdir(join(RAIZ, 'pecas'))).filter(n => /^\d{3}-/.test(n)).sort();
    return Promise.all(nomes.map(async nome => {
        let titulo = nome, sub = '';
        try {
            const md = await readFile(join(RAIZ, 'pecas', nome, 'README.md'), 'utf8');
            titulo = (md.match(/^#\s+(.+)$/m) || [, nome])[1];
            sub = (md.match(/^>\s+(.+)$/m) || [, ''])[1];
        } catch { /* peça sem README: fica só o nome da pasta */ }
        return { nome, titulo, sub };
    }));
}

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function indice() {
    const itens = (await pecas()).map(p => `
        <li><a href="/pecas/${p.nome}/index.html">${esc(p.titulo)}</a>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}</li>`).join('');
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>gen-art</title>
<style>
    body { font-family: ui-monospace, 'Courier New', monospace; background: #c5c8d0; color: #000; margin: 0; padding: 48px 16px; }
    main { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    p { margin: 0 0 32px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { background: #000; margin-bottom: 8px; padding: 16px; }
    a { color: #feb600; font-size: 18px; text-decoration: none; }
    a:hover { text-decoration: underline; }
    span { display: block; color: #ddd; font-size: 14px; margin-top: 6px; }
</style></head>
<body><main>
    <h1>gen-art</h1>
    <p>Arte generativa com p5.js. Cada peça abre com uma seed na URL.</p>
    <ul>${itens}
    </ul>
</main></body></html>`;
}

createServer(async (req, res) => {
    try {
        const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (caminho === '/') {
            res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
            return res.end(await indice());
        }
        let arquivo = normalize(join(RAIZ, caminho));
        if (!arquivo.startsWith(RAIZ) || arquivo.split(sep).includes('.git')) throw { code: 'ENOENT' };
        if ((await stat(arquivo)).isDirectory()) arquivo = join(arquivo, 'index.html');
        const dados = await readFile(arquivo);
        res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(dados);
    } catch (e) {
        res.writeHead(e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'não encontrado' : 'erro no servidor');
    }
}).listen(PORTA, () => {
    console.log(`gen-art rodando em http://localhost:${PORTA}`);
    console.log('Ctrl+C para parar.');
});
