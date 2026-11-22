# Ativar contas por e-mail — do zero

Este guia conecta **Seu Caderno Virtual 0.4.0** ao seu próprio Supabase. Você não precisa ter um projeto criado. O e-mail identifica o acesso; os projetos ficam no banco, vinculados ao usuário autenticado. Entrar na mesma conta em outro aparelho recupera o que já chegou à nuvem.

## 1. Crie o projeto Supabase

1. Abra https://supabase.com/dashboard e crie sua conta ou entre.
2. Crie uma organização se solicitado e escolha **New project**.
3. Dê um nome, por exemplo `seu-caderno-virtual`, escolha a região adequada e defina uma senha forte para o banco. Guarde essa senha de forma privada; ela não é usada no código do site.
4. Confira as condições do plano escolhido antes de confirmar qualquer contratação e aguarde o projeto ficar disponível.

## 2. Prepare o banco dos cadernos

1. No projeto, abra **SQL Editor → New query**.
2. Abra no computador o arquivo **`supabase/001_contas_e_cadernos.sql`** deste pacote.
3. Copie o conteúdo inteiro, cole no SQL Editor e execute em **Run**.
4. Confira que terminou sem erro. A tabela `public.notebook_workspaces` aparecerá no banco.

O SQL cria a tabela, validação dos documentos, políticas de acesso por usuário (RLS) e a função `save_notebook_workspace`. Cada conta só lê e altera seu registro; visitantes anônimos não leem os cadernos. A função verifica a revisão para detectar edições em outro aparelho.

O arquivo pode ser executado novamente sem apagar os cadernos. Não desative RLS para resolver um erro: confira se executou o arquivo inteiro no projeto correto.

## 3. Ative o acesso por e-mail

Em **Authentication**, abra as configurações de provedores/sign-in e selecione **Email**. Os menus podem variar; procure os campos pelo nome.

1. Ative o provedor de e-mail e permita novos cadastros.
2. Mantenha **Confirm email** ativado.
3. Configure o tamanho mínimo de senha em **8 caracteres** ou mais. Se escolher regras adicionais, informe os visitantes; o formulário exige oito caracteres e o servidor aplica suas regras adicionais.

As senhas são gerenciadas pelo Supabase Auth. Não crie uma tabela própria de senhas nem coloque senhas de usuários no GitHub.

## 4. Configure o envio para e-mails de outras pessoas

**Para aceitar cadastros em endereços em geral, configure SMTP próprio.** O SMTP padrão do Supabase é voltado a testes: restringe os destinatários a e-mails da equipe da organização Supabase e aplica limites de envio.

1. Escolha um provedor de e-mail transacional, como Brevo, Resend ou Amazon SES. Confira preços, limites e requisitos de remetente.
2. Valide o remetente ou domínio conforme as instruções do provedor e obtenha as credenciais **SMTP**. Uma chave de API HTTP não substitui automaticamente a senha SMTP.
3. No Supabase, procure **Authentication → Email → SMTP Settings** ou a configuração de **Custom SMTP**.
4. Ative o SMTP personalizado e preencha os dados fornecidos pelo provedor:

| Campo | Valor |
| --- | --- |
| Sender email | Endereço de envio autorizado pelo provedor |
| Sender name | `Seu Caderno Virtual` |
| Host | Servidor SMTP do provedor |
| Port | Porta informada pelo provedor |
| Username | Usuário SMTP fornecido pelo provedor |
| Password | Senha SMTP fornecida pelo provedor |

5. Salve e teste o cadastro com um e-mail que você controla. Confira entrada e spam.

As credenciais SMTP ficam **somente no painel do Supabase**, nunca no JavaScript do site nem no GitHub. A confirmação e a recuperação de senha dependem desse envio.

Para um teste inicial sem SMTP próprio, use um endereço já autorizado como membro da equipe da organização Supabase. Configure SMTP antes de abrir cadastros a outras pessoas. Mantenha a confirmação de endereço ativada.

## 5. Autorize a URL do site

Publique o código na Vercel conforme [PUBLICAR.md](PUBLICAR.md). Mesmo sem contas configuradas, o site abre em modo local. Copie a **URL de produção real**.

No Supabase, abra **Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| Site URL | Sua URL de produção da Vercel, terminando em `/` |
| Redirect URLs | A mesma URL de produção, terminando em `/` |
| Redirect URLs para testar localmente | `http://localhost:5173/` |

Por exemplo, **se** a Vercel publicar em `https://seu-caderno-virtual.vercel.app`, autorize `https://seu-caderno-virtual.vercel.app/`. Esse é um exemplo: use seu endereço real. O aplicativo solicita retorno à origem e ao caminho atual, sem a rota `#/...`.

Para domínio próprio ou preview diferente, cadastre o endereço exato usado. Evite liberar domínios de terceiros ou curingas amplos. Se alterar templates de e-mail, preserve as variáveis e o link de confirmação previstos pelo Supabase.

## 6. Copie a URL e a chave pública

Em **Connect** ou **Project Settings → API / API Keys**, localize:

| Valor do Supabase | Nome usado no projeto |
| --- | --- |
| Project URL, como `https://SEU-PROJETO.supabase.co` | `SUPABASE_URL` |
| Publishable key, começando com `sb_publishable_` | `SUPABASE_PUBLISHABLE_KEY` |

A chave publishable é pública e feita para uso no navegador; autenticação e RLS protegem os dados. **Nunca copie `secret`, `sb_secret_...` ou `service_role` para o site.** O build rejeita esses tipos na variável pública. Uma chave `anon` legada também é aceita no campo público se seu projeto ainda a utiliza.

Os dois valores precisam pertencer ao **mesmo projeto** em que você executou o SQL.

## 7. Adicione as variáveis na Vercel

1. Abra seu projeto na Vercel, em **Settings → Environment Variables**.
2. Adicione `SUPABASE_URL` com a URL do projeto.
3. Adicione `SUPABASE_PUBLISHABLE_KEY` com a chave publishable.
4. Marque **Production**. Se quiser testar deployments de preview, inclua **Preview** e autorize as URLs correspondentes no Supabase.
5. Salve e faça **um novo deployment**, por exemplo em **Deployments → Redeploy**.

| Configuração de build | Valor |
| --- | --- |
| Root Directory | raiz do repositório, `./` |
| Framework Preset | Other |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22 ou superior |

O build gera `dist/public-config.js` com somente os valores públicos. Não edite esse arquivo no GitHub para colocar credenciais. Sem ambas as variáveis, o site permanece local; com apenas uma, o build falha para evitar uma ativação incompleta. Variáveis novas só entram em vigor depois de refazer o deploy.

## 8. Use a conta e leve as notas antigas

1. Abra o site atualizado e clique em **Entrar → Criar conta**.
2. Informe um **e-mail real ao qual você tem acesso**, senha e confirmação da senha.
3. Confirme o cadastro no link recebido. Depois entre com e-mail e senha.
4. Se houver projetos neste navegador e a conta for nova, aceite **Trazer meus projetos** para enviá-los à conta.
5. Aguarde **Salvo na nuvem**. Depois abra em outro aparelho e entre na mesma conta para conferir.

A importação não apaga a cópia local original. Se as notas estiverem em outro domínio/navegador, exporte **Backup → Baixar backup completo** lá e restaure o JSON no site atual. Restaurar um backup diretamente na conta substitui o conteúdo atual dela após confirmação.

Uma conta existente tem **Minha conta → Trazer para esta conta**, com aviso de substituição e download do backup anterior. Não há união automática de conjuntos: todos precisam respeitar três cadernos e 300 páginas por conta.

## 9. Entenda os estados de salvamento

| Mensagem | Significado |
| --- | --- |
| Somente neste navegador | Sem login; use backup para transferir o conteúdo |
| Carregando a conta | Aguarde a verificação dos dados antes de editar |
| Neste aparelho · aguardando a nuvem | Alteração local ainda não confirmada pelo servidor |
| Salvando na nuvem | Envio em andamento |
| Salvo na nuvem | O servidor confirmou o conteúdo atual |
| Aguardando conexão com a nuvem | É preciso reconectar e sincronizar |
| Há versões diferentes para revisar | Outra edição mudou a nuvem; baixe e escolha versões em Minha conta |

Não feche a página durante uma falha de armazenamento sem baixar backup. Apagar dados do navegador remove rascunhos que ainda não chegaram à nuvem. Uma aba aberta pode continuar com a cópia disponível durante uma queda de conexão; o pacote não inclui instalação offline ou cache completo do site.

Em um conflito, baixe as duas versões antes de escolher. A escolha confere novamente a revisão: se outro aparelho tiver alterado o conteúdo de novo, a revisão será solicitada novamente. A cópia substituída também é preservada localmente. Use **Minha conta → Baixar versões preservadas neste aparelho** para exportar cópias de recuperação ou rascunhos protegidos de outras abas. Cada arquivo pode ser restaurado pelo menu Backup; confira o aviso de substituição antes de restaurar. Pare de editar em outras abas durante a resolução.

## 10. Verifique depois da ativação

Use endereços que você controla. Os testes locais estão em [VALIDACAO.md](VALIDACAO.md); estes passos verificam seu serviço real:

1. **Cadastro:** criar conta A, receber e confirmar o e-mail, entrar e anotar uma página.
2. **Outro aparelho:** aguardar Salvo na nuvem, entrar na conta A em outro aparelho e conferir o texto.
3. **Separação:** sair, criar/entrar na conta B e conferir que os projetos de A não aparecem. Criar conteúdo em B e voltar a A.
4. **Recuperação:** sair, usar Esqueci minha senha, receber o link, escolher uma nova senha e entrar.
5. **Queda de conexão:** com a conta carregada, interromper a conexão e editar; conferir que o site não diz Salvo na nuvem. Reconectar e sincronizar.
6. **Conflito:** abrir a mesma conta em dois aparelhos, editar antes de sincronizar um deles e conferir o aviso e os downloads.
7. **Backup:** exportar JSON e conferir o conteúdo antes de substituir dados.

Se o cadastro falhar, confira SMTP, confirmação de e-mail, URLs, limite de envio e logs de autenticação do Supabase. Se só as notas falharem, confira SQL e se URL/chave são do mesmo projeto. Não use chaves administrativas no frontend para contornar erros.

## Testar no computador

Use Node.js 22 ou superior e execute na pasta do projeto:

```bash
npm ci
```

Copie `.env.example` para `.env` e preencha:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

Depois:

```bash
npm run dev
```

Abra http://localhost:5173 e mantenha essa URL autorizada no Supabase. Reinicie o servidor depois de alterar `.env`: ele é lido no build que antecede a inicialização. Não envie `.env` ao GitHub.

## Referências oficiais

- [Autenticação por senha e recuperação](https://supabase.com/docs/guides/auth/passwords)
- [SMTP próprio e restrições do envio padrão](https://supabase.com/docs/guides/auth/auth-smtp)
- [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls)
- [Chaves públicas e privadas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Políticas RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Variáveis na Vercel](https://vercel.com/docs/environment-variables)
