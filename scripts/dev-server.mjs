import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const hostIndex = args.indexOf('--host');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 5173);
const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
 console.error('PORT deve ser um número de 1 a 65535.');
 process.exit(1);
}
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2'};
const server = createServer(async (request, response) => {
 if (!['GET', 'HEAD'].includes(request.method)) {
  response.writeHead(405, {'Allow': 'GET, HEAD'}).end('Método não permitido.');
  return;
 }
 try {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root) || !(await stat(file)).isFile()) {
   response.writeHead(404).end('Arquivo não encontrado.');
   return;
  }
  const content = await readFile(file);
  response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  response.end(request.method === 'HEAD' ? undefined : content);
 } catch (error) {
  response.writeHead(error instanceof URIError ? 400 : 404).end('Arquivo não encontrado.');
 }
});
server.on('error', error => {
 console.error(error.code === 'EADDRINUSE' ? `A porta ${port} está em uso. Feche o outro servidor ou escolha outra PORT.` : error.message);
 process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Seu Caderno Virtual: http://${host}:${port}\nCtrl+C para encerrar.`));
