# Login por e-mail

Na versão atual, o Supabase mantém somente login e foto de perfil no fluxo normal. Projetos e cadernos são salvos em uma pasta do computador; não existe mais sincronização automática das anotações entre aparelhos.

## Configuração

1. No Supabase, ative o provedor de e-mail no Authentication e configure o envio de confirmação e recuperação. Configure SMTP quando necessário para atender outros usuários.
2. Em URL Configuration, use `https://seu-caderno-virtual.vercel.app/` como Site URL e Redirect URL, sem `#/...`.
3. Na Vercel, adicione a Project URL como `SUPABASE_URL` e a chave pública como `SUPABASE_PUBLISHABLE_KEY` em Production e faça um novo deployment.
4. Use apenas chave publishable ou anon. Nunca use secret ou service_role no frontend.
5. Para fotos, siga `ATIVAR_FOTOS.md` e a migração `supabase/002_fotos_de_perfil.sql`.

Se a configuração pública estiver ausente, o aplicativo permite usar uma pasta como visitante. A conta usa uma subpasta própria dentro da pasta escolhida; o visitante usa outra. Entrar não envia as anotações do visitante para o servidor.

## Dados antigos da nuvem

Se `supabase/001_contas_e_cadernos.sql` já foi aplicado, mantenha a tabela e suas políticas para permitir que cada usuário importe seus cadernos. A função antiga de gravação permanece no banco, mas não é chamada pelo aplicativo atual. Não execute SQL novo nem apague dados para ativar a gravação em pasta.

Depois de entrar e conectar uma pasta, use **Minha conta → Importar cadernos antigos da nuvem**. A importação lê somente os dados da conta atual, salva um backup anterior na pasta e preserva a origem no servidor. As cópias antigas do navegador também estão disponíveis em **Minha pasta**.

Os arquivos locais são legíveis por quem tiver acesso a eles. O login separa os espaços usados pelo aplicativo; ele não criptografa nem protege os arquivos do computador contra outros programas ou usuários do sistema.
