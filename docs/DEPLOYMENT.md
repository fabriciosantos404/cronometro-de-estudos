# Deploy

Aplicação **estática** — qualquer host de arquivos estáticos serve. Sem servidor de aplicação, sem banco de dados, sem migração.

## 1. Build de produção

```bash
npm install
npm run build     # tsc --noEmit && vite build  → dist/
npm run preview   # valida localmente (http://localhost:4173)
```

Saída em `dist/` (assets com base **relativa** `./`, portanto funcionam na raiz **ou** em sub-pasta):

```
dist/
├── index.html
├── assets/index-*.js      (~9 KB gzip)
├── assets/index-*.css     (~4 KB gzip)
├── favicon.svg
├── manifest.webmanifest
└── sw.js
```

## 2. GitHub Pages (recomendado)

O build usa `base: './'`, então **não é preciso** ajustar caminhos para o site de projeto.

1. **Build** (Actions) → publica `dist/` no branch `gh-pages`, **ou**
2. Servir direto de `/docs` ou de um branch de build.

Workflow de CI/CD incluído: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- roda typecheck + unit tests + E2E a cada push/PR;
 publica no GitHub Pages em push para `main`.

Ative em **Settings → Pages → Source: GitHub Actions**.

## 3. Docker (auto-hospedagem)

Hospedar via nginx estático:

```bash
docker build -t cronometro-estudos .
docker run -p 8080:80 cronometro-estudos
# http://localhost:8080
```

`Dockerfile` usa build multi-estágio (node → nginx alpine). Consulte `nginx.conf` para cache e headers.

## 4. Variáveis de ambiente

**Nenhuma variável de ambiente necessária.** O app não consome `VITE_*` nem segredos — reforço do modelo local-first (nada a configurar, nada a expor).

> Se no futuro for adicionada alguma config, crie `.env.example` **sem valores reais** e nunca versione `.env` (já coberto pelo `.gitignore`).

## 5. Health check

Não há backend. Para monitoramento de disponibilidade da página, faça `GET /` e valide `200` + presença do marker no HTML (ex.: `id="timerDisplay"`).

## 6. SSL/TLS

- **GitHub Pages:** HTTPS automático e obrigatório.
- **Próprio servidor:** terminar TLS no reverse proxy (Caddy/nginx/Let's Encrypt) e redirecionar HTTP→HTTPS.

## 7. Reverse proxy (auto-hospedado)

Exemplo nginx (o `nginx.conf` do repo já cobre isto):

```nginx
server {
  listen 80;
  server_name estudos.exemplo.com;
  root /usr/share/nginx/html;
  index index.html;

  # Segurança
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

  # SPA fallback
  location / { try_files $uri $uri/ /index.html; }

  # Assets versionados: cache longo
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

## 8. Estratégia de rollback

- **GitHub Pages:** cada deploy é um artefato do commit — reverte-se com `git revert` (dispara novo deploy) ou re-executa o deploy do commit anterior.
- **Docker:** manter a tag anterior da imagem e re-executar a tag conhecida boa.
- Como não há banco/migração, rollback nunca ameaça dados (o estado vive no navegador do usuário).

## 9. Monitoramento e logs

- Sem logs de servidor (não há servidor).
- Erros de UI aparecem como toasts; falhas de gravação sinalizam no indicador "Salvo neste navegador".
- Para observabilidade de uptime, usar monitor de páginas (ex.: UptimeRobot) apontando para `GET /`.

## 10. Ambientes

| Ambiente | Como rodar |
|----------|-----------|
| **Development** | `npm run dev` |
| **Test / CI** | `npm run typecheck && npm test && npm run test:e2e` |
| **Staging** | `npm run build && npm run preview` (validação visual) |
| **Production** | deploy de `dist/` (GitHub Pages/Docker/estático) |

## 11. Checklist pré-produção (DevOps)

- [x] `npm run build` sem erros (type-check + bundle)
- [x] Testes unitários e E2E verdes
- [x] Nenhuma variável/segredo pendente (nenhum necessário)
- [x] Assets com caminho relativo (raiz ou sub-pasta)
- [x] `manifest` + `sw.js` incluídos no `dist/`
- [x] CSP e ícones presentes
- [x] Rollback por git revert (sem banco)
- [x] Health check = `GET /`
