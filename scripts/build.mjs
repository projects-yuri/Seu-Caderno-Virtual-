import {access, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {publicConfiguration} from './public-config.mjs';

if (existsSync(new URL('../.env', import.meta.url))) process.loadEnvFile(new URL('../.env', import.meta.url));
const config = publicConfiguration(process.env);
// The SDK is already bundled and versioned in dist/vendor. Deployment only
// validates its presence and generates the public configuration. No package
// from node_modules is required by this build script.
try { await access(new URL('../dist/vendor/supabase.js', import.meta.url)); }
catch { throw new Error('SDK ausente: envie dist/vendor/supabase.js do ZIP para o GitHub antes de publicar.'); }
await writeFile(new URL('../dist/public-config.js', import.meta.url), `// Gerado por npm run build. Contém somente a configuração pública.\nexport const publicConfig = ${JSON.stringify(config, null, 2)};\n`);
console.log(config.enabled ? 'Build concluído: contas conectadas à configuração Supabase.' : 'Build concluído: modo local. Configure o Supabase para ativar as contas.');
