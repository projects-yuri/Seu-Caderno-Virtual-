# Corrigir abertura da pasta

O aplicativo procura `folders.js` e `folders.css`, com S no final. Na versão enviada ao GitHub, os arquivos estavam como `folder.js` e `folder.css`. Isso gerou respostas 404 nos dois endereços usados pelo site e impediu o carregamento do aplicativo.

O `package-lock.json` também estava com conteúdo de um teste JavaScript, em vez de JSON. Este pacote restaura o arquivo correto. O arquivo `COMO_ATUALIZAR.md` estava com conteúdo de `accounts.js` e foi restaurado como instrução.

## Aplicar esta correção

1. Extraia o ZIP e abra a pasta `Seu-Caderno-Virtual-Correcao-Pasta`.
2. Substitua `package-lock.json` e `COMO_ATUALIZAR.md` na raiz do repositório.
3. Envie `folders.js` e `folders.css` para a pasta `dist` do GitHub, preservando exatamente esses nomes. Não envie os dois arquivos para a raiz e não remova o S dos nomes.
4. Remova os arquivos antigos `dist/folder.js`, `dist/folder.css`, `dist/cloud-sync.js` e `tests/cloud-sync.test.js`. São arquivos de código substituídos; não contêm as anotações dos usuários.
5. Faça o commit. Aguarde o deployment da Vercel concluir; se necessário, use Redeploy no deployment mais recente.
6. Reabra o site. Se a versão anterior persistir no navegador, use Ctrl+Shift+R no computador.
7. Clique em **Escolher pasta**, selecione uma pasta e autorize o acesso. Após editar uma anotação, aguarde **Salvo na pasta do computador**.

Este ZIP contém somente os quatro arquivos novos ou corrigidos acima. Preserve os demais arquivos do projeto. Não faça upload da pasta externa como uma nova subpasta dentro do repositório.

Nenhuma mudança ou exclusão no Supabase é necessária. As anotações e fotos dos usuários não são alteradas por esta correção.
