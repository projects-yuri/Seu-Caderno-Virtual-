# Validação — versão 0.5.0

## Verificações executadas

- `npm ci --ignore-scripts --no-audit --no-fund`: dependências instaladas.
- `npm test`: **53 testes aprovados, nenhum com falha**.
- `npm run build`: concluído, incluindo validação de sintaxe de todos os módulos.
- `git diff --check`: sem erros de formatação.

Os testes da camada de pastas usam implementações simuladas dos identificadores de arquivo, permissões e IndexedDB. Cobrem gravação e reabertura, cancelamento do seletor, autorização ao voltar, falha de disco e permissão, novas edições durante uma gravação, separação por conta, respostas atrasadas, conflito entre abas, arquivo corrompido, importação com backup anterior, recuperação de rascunho, restauração, navegador incompatível, falha do cache, importação repetida e falha na primeira gravação.

Também foram executados os testes de configuração pública, provedor de importação somente por leitura, validação de backups, projetos e cadernos, isolamento das fotos de perfil e compatibilidade das migrações históricas do PostgreSQL.

## Verificações que ainda precisam de navegador real

A verificação visual foi bloqueada pelo ambiente: o Chromium local não conseguiu iniciar e o navegador remoto não conseguiu acessar o servidor local. Não houve teste concluído do seletor nativo de pastas nem validação visual em computador ou celular.

O roteiro de aceitação manual após publicar está em `PUBLICAR.md`. Confirme especialmente seleção e autorização da pasta no Chrome/Edge, gravação de uma anotação, reabertura e importação dos dados antigos. O teste de integração com uma conta Supabase real e o deployment na Vercel não foram executados nesta sessão.

## Estado da entrega

Os arquivos foram alterados e validados localmente. A integração GitHub retornou `403 Resource not accessible by integration` ao tentar criar uma branch. A alternativa por Git não possui credenciais de escrita. Nenhum commit foi enviado ao repositório remoto; nenhum deployment, configuração do Supabase ou dado do usuário foi alterado.
