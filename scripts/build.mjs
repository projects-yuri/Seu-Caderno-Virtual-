import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {publicConfiguration} from './public-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(new URL('../.env', import.meta.url))) process.loadEnvFile(new URL('../.env', import.meta.url));
const config = publicConfiguration(process.env);
await mkdir(new URL('../dist/vendor/', import.meta.url), {recursive: true});
await build({entryPoints: [root + 'src/supabase-browser.js'], outfile: root + 'dist/vendor/supabase.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'eof', logLevel: 'warning'});
await writeFile(new URL('../dist/public-config.js', import.meta.url), `// Gerado por npm run build. Contém somente a configuração pública.\nexport const publicConfig = ${JSON.stringify(config, null, 2)};\n`);
console.log(config.enabled ? 'Build concluído: contas conectadas à configuração Supabase.' : 'Build concluído: modo local. Configure o Supabase para ativar as contas.');
