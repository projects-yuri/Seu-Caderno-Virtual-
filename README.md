# Seu Caderno Virtual

Projetos, cadernos e páginas salvos na pasta escolhida pelo usuário. Login por e-mail e foto de perfil continuam no Supabase. As anotações não são mais enviadas ao banco.

## Começar

1. Abra o site por HTTPS no Chrome ou Edge em um computador.
2. Entre na conta, se desejar, e clique em **Escolher pasta**.
3. Selecione ou crie `Documentos/Seu-Caderno-Online` e autorize leitura e gravação.
4. Crie e edite seus projetos. Aguarde **Salvo na pasta do computador** antes de fechar.
5. Ao voltar, o site tenta reabrir a pasta. Se o navegador pedir autorização novamente, clique em **Minha pasta → Reconectar / salvar**.

Não é necessário ativar um serviço ou obter uma chave para a File System Access API.

## Onde ficam os cadernos

A pasta contém `visitante/cadernos.json` para o modo sem conta ou `conta-ID-DO-USUARIO/cadernos.json` para cada conta. Cada arquivo guarda todos os projetos, capas, páginas, favoritos e preferências daquele espaço. As contas usam subpastas separadas, mesmo quando escolhem a mesma pasta principal. Os arquivos não são criptografados: o acesso aos arquivos do computador permite ler seu conteúdo.

Não há limite global de projetos, cadernos ou páginas. Cada caderno mantém de 100 a 300 páginas para a navegação. O limite de texto por página continua em 250.000 caracteres de HTML. O tamanho prático do conjunto depende do espaço em disco e da memória do navegador: o arquivo completo é carregado e gravado em memória. A edição de uma pasta por vários navegadores ou computadores simultaneamente não é um modo colaborativo suportado.

## Importar os dados anteriores

1. Entre na mesma conta usada anteriormente.
2. Conecte a pasta.
3. Abra **Minha conta** ou **Minha pasta → Importar cadernos antigos da nuvem**.
4. Revise e confirme. Projetos e cadernos serão adicionados à pasta; versões diferentes são preservadas em cópias.
5. Confira o conteúdo e a indicação de gravação concluída. Faça também um backup em outro local.

O painel **Minha pasta** oferece cópias antigas do navegador, alterações que ficaram sem enviar à nuvem e rascunhos de recuperação. Cada importação cria um `backup-antes-importacao-*.json` na pasta antes de mudar o conteúdo. O botão **Backup → Restaurar um backup** substitui o conteúdo aberto após essa cópia anterior.

Importar não apaga nem altera os dados no Supabase. A consulta à nuvem ocorre somente por ação explícita. O site não chama mais a função de gravação de cadernos.

## Supabase e Vercel

Mantenha Authentication e o Storage das fotos. Mantenha a tabela antiga enquanto usuários ainda precisarem importar seus dados. Não é necessário rodar SQL novo nem desativar o Supabase para usar pastas. Os dados antigos continuam ocupando espaço até uma remoção deliberada, feita somente depois de conferir as cópias. Esta atualização não executa exclusões.

As variáveis públicas da Vercel continuam sendo `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. A URL do site e os redirecionamentos do Authentication devem usar `https://seu-caderno-virtual.vercel.app/` sem fragmento `#/...`. Nunca exponha uma chave secret ou service_role.

## Recuperação e limites

- Uma falha de permissão, disco ou gravação permanece visível. As alterações ficam em memória e, quando possível, em um rascunho de emergência no IndexedDB.
- O estado “salvo” depende de fechar com sucesso o fluxo de gravação no arquivo.
- O site avisa ao fechar se ainda houver alterações pendentes. Não dependa do fechamento da aba para iniciar uma gravação.
- Arquivos inválidos não são sobrescritos. Recupere um backup em outra pasta e preserve o arquivo original.
- Antes de salvar, o aplicativo confere se o arquivo mudou. Abas da mesma origem usam Web Locks para serializar gravações. Se houver conflito, baixe as alterações, reabra a versão da pasta e importe o rascunho preservado.
- No caso de apagamento dos dados do navegador, a autorização e os rascunhos podem sumir; os arquivos já gravados na pasta continuam disponíveis.
- Entrar em outro aparelho não transfere os cadernos. Leve a pasta ou importe um backup.
- Navegadores sem `showDirectoryPicker` exibem orientação e permitem baixar cópias antigas, mas bloqueiam edição para evitar a impressão de salvamento automático inexistente.
- O site precisa estar carregado para editar. Esta versão não inclui instalação PWA ou garantia de abrir o site sem conexão.

## Desenvolvimento

Node.js 22 ou superior:

```sh
npm ci
npm test
npm run build
npm run dev
```

`dist/` contém os módulos do aplicativo. O build valida os scripts e gera somente a configuração pública do Supabase. O SDK já está incluído em `dist/vendor`. Não envie `.env`, credenciais ou `node_modules` para o GitHub.
