# Publicar no GitHub e na Vercel

Esta versão inclui projetos, cadernos, modo escuro e contas opcionais com Supabase. Sem configurar as contas, o site funciona com notas locais. Siga [ATIVAR_CONTAS.md](ATIVAR_CONTAS.md) para ativar a nuvem.

## 1. Atualizar o GitHub

1. Extraia o ZIP e abra https://github.com/projects-yuri/Seu-Caderno-Virtual-
2. Use **Add file → Upload files** e envie os arquivos e pastas **de dentro** da pasta extraída. Substitua os antigos pelos desta versão.
3. Confira que `package.json`, `package-lock.json` e `vercel.json` estão na raiz, ao lado de `dist`, `scripts`, `src`, `supabase` e `tests`. Não envie o ZIP fechado nem crie uma pasta extra dentro do repositório.
4. Confirme em **Commit changes**.# Publicar a versão com pasta local

1. Envie os arquivos atualizados ao mesmo repositório do GitHub, preservando os diretórios `dist`, `scripts`, `src`, `supabase` e `tests`.
2. Na Vercel, mantenha o projeto ligado a esse repositório, o comando `npm run build` e a pasta de saída `dist` conforme `vercel.json`.
3. Mantenha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no ambiente Production. Nunca use secret ou service_role no aplicativo.
4. Faça um novo deployment. Se a alteração estiver em uma branch, revise a prévia antes de integrar na branch de produção.
5. Abra a versão publicada no Chrome ou Edge, entre na conta e clique em **Escolher pasta**.
6. Importe os cadernos antigos, confira uma anotação e aguarde **Salvo na pasta do computador**. Feche e reabra o site e confirme a leitura dos arquivos.

## O que mudar no Supabase

Nada precisa ser desativado. Authentication continua responsável pelo login. O Storage continua responsável pela foto de perfil. A tabela `notebook_workspaces` fica disponível para leitura dos dados anteriores, sob as permissões existentes por usuário.

Esta versão não chama a função `save_notebook_workspace`. Não precisa aplicar migração SQL nova nem ampliar os limites da tabela. As migrações antigas ficam no repositório como documentação e para testes de compatibilidade. Se o projeto já estava configurado, não precisa executá-las novamente.

Não apague tabelas, contas, buckets ou anotações durante a atualização. A limpeza futura dos dados antigos deve ocorrer somente após os usuários confirmarem suas cópias; ela não é automatizada aqui.

No Authentication, mantenha **Site URL** e **Redirect URLs** como `https://seu-caderno-virtual.vercel.app/`, sem `#/projetos`.

## Verificação manual após publicar

- Selecionar pasta e cancelar: o site continua pedindo uma pasta, sem dizer que salvou.
- Criar um quarto caderno e uma anotação: conferir o conteúdo em `conta-ID/cadernos.json` e reabrir o site.
- Retirar e conceder novamente a permissão: confirmar aviso e reconexão.
- Abrir duas abas e alterar o mesmo conjunto: verificar o conflito sem sobrescrita silenciosa.
- Importar da nuvem: verificar a cópia anterior, a anotação importada e a preservação dos dados no Supabase.
- Sair e entrar em outra conta: conferir que as subpastas e anotações ficam separadas.
- Usar um navegador sem seleção de pasta: conferir a orientação de compatibilidade e o bloqueio de edição.

O site não tem garantia de abertura offline. Os arquivos já salvos ficam no computador; para editar, o aplicativo precisa ter sido carregado.


Não envie `node_modules`, `.env` com valores reais ou credenciais SMTP. O `.env.example` contém apenas nomes de variáveis e pode ser enviado; os guias também informam esses nomes caso o upload pelo navegador oculte arquivos iniciados por ponto.

Se preferir Git, clone o repositório, copie o conteúdo extraído para a pasta clonada e execute nela:

```bash
git add .
git commit -m "feat: adiciona contas e sincronizacao com Supabase"
git push origin main
```

## 2. Configurar a Vercel

Abra seu projeto em https://vercel.com/dashboard. Para um novo, use https://vercel.com/new e importe `projects-yuri/Seu-Caderno-Virtual-`.

| Campo | Valor |
| --- | --- |
| Project Name | `seu-caderno-virtual` ou outro nome livre |
| Framework Preset | **Other** |
| Root Directory | **raiz do repositório, `./`** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | automático com npm, ou `npm ci` |
| Node.js | 22 ou superior |

**Não use `dist` em Root Directory.** A raiz contém o `package.json`; `dist` é o resultado servido. Se aparecer `No Output Directory named "dist"`, confira os dois campos separadamente. Use um nome como `seu-caderno-virtual`, sem espaços, exclamação ou três hífens consecutivos.

Publique e copie a URL de produção real. Ela será necessária nas URLs autorizadas do Supabase.

## 3. Ativar as contas

Siga [ATIVAR_CONTAS.md](ATIVAR_CONTAS.md): crie seu Supabase, execute o SQL, configure e-mail e URLs, adicione as duas variáveis na Vercel e faça **um novo deployment**.

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública publishable do projeto |

Nunca use `secret` ou `service_role`. Credenciais SMTP ficam apenas no Supabase. Variáveis são incorporadas no build: adicioná-las sem refazer o deploy não ativa contas no site já publicado. Se ambas estiverem ausentes, continua em modo local; se apenas uma existir, o build falha.

## 4. Preservar as notas anteriores

Antes de trocar de domínio, use **Backup → Baixar backup completo** no endereço antigo. No novo, use **Backup → Restaurar um backup**.

Depois de entrar em uma conta nova, aceite **Trazer meus projetos** e aguarde **Salvo na nuvem**. Se a conta já tiver conteúdo, use **Minha conta → Trazer para esta conta**, confira o aviso de substituição e guarde o backup anterior. Sem login, as notas continuam locais por domínio.

## Desenvolvimento

```bash
npm ci
npm run dev
npm run build
npm test
```

O servidor usa http://localhost:5173. Após alterações, envie um commit e acompanhe o deployment da branch de produção na Vercel.

## Problemas comuns

- **404 no início:** confira `dist/index.html` no GitHub e Output Directory em `dist`.
- **package.json não encontrado:** Root Directory deve ser a raiz.
- **Build sem esbuild/SDK:** envie `package.json` e `package-lock.json` novos e permita a instalação npm. Dependências de desenvolvimento são necessárias ao build.
- **Contas não ativadas:** adicione as duas variáveis e refaça o deployment.
- **E-mail não chega ou “Email address not authorized”:** confira SMTP próprio; o envio padrão é restrito a endereços da equipe Supabase.
- **Conta abre, mas notas não carregam:** execute o SQL no mesmo Supabase da URL e chave usadas na Vercel.
- **Link leva ao endereço errado:** ajuste Site URL/Redirect URLs e peça um link novo.
- **Notas antigas não aparecem:** confira a conta; conteúdo de outro domínio precisa de backup/importação.

Referências oficiais: [build](https://vercel.com/docs/builds/configure-a-build), [variáveis](https://vercel.com/docs/environment-variables), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
