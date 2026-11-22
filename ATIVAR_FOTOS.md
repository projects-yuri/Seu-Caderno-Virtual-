# Foto de perfil e novas cores

A foto agora aparece no lugar do ícone de pessoa no botão **Minha conta**. Ao abrir a conta, você pode adicionar, trocar ou remover a imagem. Cada conta tem sua própria foto; entrar em outro aparelho recupera a imagem salva na nuvem.

## 1. Ativar o armazenamento das fotos

No seu projeto Supabase, abra **SQL Editor → New query**. Copie o conteúdo completo do arquivo `supabase/002_fotos_de_perfil.sql`, cole no editor e clique em **Run**. Faça isso uma vez. O script pode ser repetido sem apagar as fotos.

Esse SQL cria o bucket privado `caderno-profile-photos` e as permissões para cada pessoa acessar somente o arquivo da própria conta. Não marque o bucket como público. A migração não altera seus projetos ou páginas.

As contas e cadernos já devem estar funcionando com a migração `001_contas_e_cadernos.sql`. Se você já a executou, não precisa executá-la novamente para esta atualização.

## 2. Atualizar o GitHub e a Vercel

Se você baixou o pacote **Atualizacao_Foto_e_Cores.zip**, extraia-o e envie os arquivos e pastas extraídos para a raiz do mesmo repositório GitHub, preservando as pastas `dist`, `supabase` e `tests`. Aceite a substituição dos arquivos existentes e faça o commit. Os arquivos do pacote complementam o projeto existente; não apague os outros arquivos de `dist`, inclusive `vendor/supabase.js`.

O pacote completo **Seu_Caderno_Virtual_GitHub_Vercel.zip** também já inclui esta atualização. A pasta `Seu-Caderno-Virtual` dentro dele contém a raiz do projeto.

Na Vercel, aguarde o deployment do **novo commit**. Mantenha:

- Root Directory: raiz do repositório, campo vazio.
- Framework Preset: Other.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Variáveis de ambiente de Production: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, com os valores que já fazem suas contas funcionar.

Não é necessário adicionar chave secreta, service role ou outra variável para as fotos. A configuração pública incluída no ZIP está desativada; o build da Vercel a gera com as variáveis existentes.

## 3. Usar a foto

Abra o site atualizado, entre na sua conta e clique em **Minha conta → Adicionar foto**. Escolha JPG, PNG ou WebP de até 8 MB. A imagem é recortada pelo centro e reduzida para até 512 × 512 pixels; a versão enviada é reprocessada, sem os metadados do arquivo original. A interface confirma **Foto salva na sua conta.** somente após o armazenamento responder com sucesso.

Para testar a persistência, recarregue o site ou entre na mesma conta em outro aparelho. Para testar o isolamento, saia e entre com outro e-mail: ele deve ter seus próprios projetos e sua própria foto. **Remover foto** apaga a imagem da conta. As imagens de perfil não fazem parte do backup JSON de cadernos nem consomem o limite de páginas.

Se o envio falhar, confira se a migração `002_fotos_de_perfil.sql` foi executada no mesmo Supabase das variáveis da Vercel. A ausência do bucket não bloqueia o login ou o uso dos cadernos.

## Cores

- Fundo do modo escuro: Baltic Sea `#252226` (RGB 37, 34, 38).
- Cabeçalho e contornos do modo escuro: Mirage `#1A1A1E` (RGB 26, 26, 30).
- Superfícies dos cartões e janelas: tons neutros próximos, com os acentos verdes do aplicativo.
- O modo claro e as cores das capas continuam disponíveis.

## Quem pode consultar os dados?

**Como dono ou administrador do projeto Supabase, você pode consultar e-mails, projetos, anotações e fotos que os usuários enviam à nuvem.** Isso é acesso administrativo pelo Supabase, não uma opção comum no aplicativo. Em **Authentication → Users** ficam os usuários e seus IDs; em **Table Editor → notebook_workspaces** ficam os projetos e páginas vinculados ao `user_id`; em **Storage → caderno-profile-photos** ficam as fotos nas pastas dos respectivos IDs.

As regras RLS do aplicativo restringem usuários comuns aos próprios dados. Elas não escondem dados de administradores com privilégios elevados. O conteúdo não usa criptografia de ponta a ponta, portanto não prometa aos usuários que nem o responsável pelo serviço pode lê-lo. Senhas são armazenadas pelo Supabase Auth como hashes, e não como texto puro.

Anotações usadas sem login e alterações ainda não sincronizadas podem existir somente no aparelho. Elas não aparecem no seu painel até serem enviadas à nuvem.

Referências: https://supabase.com/docs/guides/storage/security/access-control e https://supabase.com/docs/guides/auth/password-security

## Validação desta atualização

- Build de produção aprovado e 51 testes automatizados aprovados.
- Políticas SQL executadas em PostgreSQL local (PGlite), com duas contas e acesso anônimo, incluindo tentativa de leitura, gravação, exclusão e transferência de arquivo de outra conta.
- Troca de conta durante carregamento ou envio da foto: respostas atrasadas não exibem a foto da conta anterior.
- Regressão de entrada, saída, troca de conta e migração dos cadernos locais aprovada em teste de integração.
- Envio real pelo seletor do navegador, recorte para 512 × 512, exibição e remoção verificados em prévia com conta e armazenamento simulados. As cores calculadas no navegador correspondem aos HEX solicitados.
- O novo armazenamento ainda precisa ser ativado e conferido no seu Supabase de produção com o SQL acima; os testes locais não substituem essa verificação.
