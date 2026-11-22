# Publicar no GitHub e na Vercel

Este pacote já contém o site completo, incluindo a organização Projetos → Cadernos, o modo escuro e a configuração da Vercel. Não precisa de banco de dados, senha de API ou variáveis de ambiente.

## 1. Enviar os arquivos ao GitHub

1. Extraia o ZIP em uma pasta no computador.
2. Abra o repositório: https://github.com/projects-yuri/Seu-Caderno-Virtual-
3. Clique em **Add file → Upload files**.
4. Arraste os arquivos e pastas que estão **dentro da pasta extraída**, mantendo a estrutura. Não envie o ZIP fechado e não coloque tudo dentro de uma segunda pasta no repositório.
5. O `package.json` e o `vercel.json` precisam aparecer diretamente na raiz do repositório, ao lado da pasta `dist`.
6. Confirme em **Commit changes**. Se o GitHub pedir para substituir o README, use o README deste pacote. A licença MIT foi preservada.

Se preferir usar Git pelo terminal, clone o repositório, copie o conteúdo extraído para dentro da pasta clonada e execute nela:

```bash
git add .
git commit -m "feat: adiciona Seu Caderno Virtual com modo escuro e deploy Vercel"
git push origin main
```

## 2. Importar na Vercel

1. Abra https://vercel.com/new e entre na sua conta.
2. Conecte o GitHub se for solicitado e permita acesso ao repositório `Seu-Caderno-Virtual-`.
3. Selecione esse repositório e clique em **Import**.
4. Use as configurações abaixo. O arquivo `vercel.json` já define o framework, o comando de build e a pasta de saída.

| Campo | Valor |
| --- | --- |
| Project Name | `seu-caderno-virtual` (ou outro nome livre) |
| Framework Preset | **Other** |
| Root Directory | raiz do repositório, `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | automático (npm) |
| Environment Variables | nenhuma |

5. Clique em **Deploy** e aguarde a confirmação.
6. Abra a URL que a Vercel informar. O endereço real será criado na sua conta; não é o link do protótipo do ChatGPT.

Mantenha **Root Directory na raiz**, não em `dist`: a Vercel precisa encontrar o `package.json` e o `vercel.json`. `dist` é apenas a pasta de saída.

## 3. Atualizar depois

Edite os arquivos, envie um novo commit ao GitHub e acompanhe a nova publicação na Vercel. Com a integração Git ativa, novos commits na branch de produção geram novos deployments.

## 4. Levar as notas do protótipo para a Vercel

As anotações são locais por domínio. Antes de trocar de endereço:

1. No protótipo antigo, abra **Backup → Baixar backup completo**.
2. No site da Vercel, abra **Backup → Restaurar um backup**.
3. Escolha o arquivo JSON e confira a confirmação antes de restaurar.

O tema claro/escuro é uma preferência separada: escolha novamente no botão de lua/sol do site novo.

Backups do protótipo anterior também são aceitos. Os cadernos antigos entram no projeto **Meus cadernos** e podem ser reorganizados depois. Nesta versão, os projetos compartilham o limite total de 3 cadernos e 300 páginas.

## Executar no computador

Com Node.js instalado, abra o terminal na pasta que contém o `package.json` e execute:

```bash
npm run dev
```

Abra http://localhost:5173. Não é necessário instalar dependências. Para conferir o projeto:

```bash
npm run build
npm test
```

Não abra `dist/index.html` com duplo clique: o editor usa módulos JavaScript e precisa de um servidor HTTP.

## Se aparecer um erro

- **404 no endereço principal:** confira se `dist/index.html` foi enviado e se Output Directory está em `dist`.
- **package.json não encontrado:** Root Directory deve apontar para a pasta que contém esse arquivo.
- **Pasta dist não encontrada:** envie a pasta inteira, sem mudar seu nome.
- **O repositório não aparece para importar:** confira as permissões da conexão GitHub na Vercel para esse repositório.
- **As notas antigas não aparecem:** exporte e restaure o backup; o navegador não transfere notas entre domínios automaticamente.

Referências oficiais:

- https://vercel.com/docs/git
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/project-configuration/vercel-json
