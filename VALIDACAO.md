# Verificação desta versão

Versão 0.4.0 — contas Supabase preparadas para configuração pelo responsável do site.

## Executado

- Instalação npm das dependências declaradas, com lockfile.
- `npm run build`: sintaxe JavaScript, empacotamento do SDK e geração da configuração pública.
- `npm test`: **39 testes aprovados**, incluindo os do protótipo anterior, em Node.js 24.
- SQL executado em PostgreSQL via PGlite com papéis `authenticated` e `anon`, usuários simulados e políticas RLS reais. Testados acesso por dono, bloqueio anônimo, tentativa de acessar outra conta, limites, projetos inexistentes, revisão concorrente e reexecução sem apagar dados.
- Sincronização testada com armazenamento e rede controlados: falta de conexão, retomada após recarregar, conflitos, digitação durante leitura/salvamento e resposta antiga depois de trocar de conta.
- Interface revisada no navegador: aviso sem configuração, entrada, cadastro, recuperação e abertura de notas antigas. Os formulários foram inspecionados com configuração ilustrativa de prévia; nenhum cadastro ou e-mail real foi enviado.

## Depende da sua configuração

Não foi criado um projeto Supabase, configurado SMTP ou publicado um deployment na sua Vercel nesta etapa. Não houve login real, teste de entrega de e-mail, confirmação de endereço nem alteração de senha em um serviço real. Execute o roteiro de `ATIVAR_CONTAS.md` depois de conectar seus serviços.

O pacote é entregue com `dist/public-config.js` em modo local, sem credenciais reais. A Vercel gera a configuração ativa a partir das variáveis públicas no próximo build.
