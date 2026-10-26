# Segurança

> Modelado por um **Senior Application Security Engineer**. Por ser **local-first sem backend**, a superfície de ataque é drasticamente menor: não existem endpoints, banco remoto, autenticação nem tráfego de dados de aplicação. Ainda assim, aplicamos controles adequados ao contexto.

## 1. Modelo de ameaças

| Ameaça | Vetor no contexto | Controle | Status |
|--------|-------------------|----------|--------|
| **XSS (reflected/stored)** | Nome de matéria, comentário e backup importados renderizados na UI | Todo texto do usuário entra via **`textContent`** (nunca `innerHTML` com dado externo). `svg()` restrito a markup autoral e estático. | ✅ Mitigado |
| **SQL Injection** | Sem banco/SQL | Não aplicável (sem backend/SGBD) | ✅ N/A |
| **CSRF** | Sem sessão/estado mutável em servidor | Não aplicável (sem requisições autenticadas) | ✅ N/A |
| **SSRF / Command Injection / Path Traversal** | Sem chamadas de rede/Exec/fs do lado do cliente | Não aplicável; nenhum `eval`, `Function`, `child_process` ou fetch de URL de usuário | ✅ N/A |
| **IDOR / falha de autorização** | Sem múltiplos usuários/objetos | Não aplicável (single-user, dados locais) | ✅ N/A |
| **Hostile backup importado** | JSON malicioso (tipos errados, `color: "javascript:..."`, HTML em `name`) | `importBackup` → `normalizeState` valida/sanitiza **todos** os campos; nunca lança exceção. Testado com payload hostil. | ✅ Mitigado |
| **DOM clobbering / injeção via atributo** | Atributos `style` de cor | Cor validada por regex hex (`sanitizeColor`); valor inválido cai no fallback da paleta | ✅ Mitigado |
| **Secrets expostos** | — | Não há segredos: sem chaves de API, sem tokens, sem credenciais | ✅ N/A |
| **Dependências vulneráveis** | Supply chain | **0 dependências de runtime**; apenas dev/build (Vite/TS/Vitest/Playwright) | ✅ Mínimo |
| **Vazamento de dados** | Envio a servidores | Nenhuma requisição de dados; CSP `connect-src 'self'` | ✅ Protegido |
| **Clickjacking** | iframe | CSP `frame-ancestors 'none'` | ✅ Bloqueado |
| **Ataque a dados em repouso** | Acesso físico ao navegador | Dados não são sensíveis (horas de estudo); sem senhas/PII. Criptografia de repouso não aplicável. | ✅ Aceitável |

## 2. Controles implementados

### 2.1 Sanitização de entrada (fronteira de confiança)
`src/domain/validation.ts` valida **toda** entrada não confiável:
- `sanitizeText` — remove caracteres de controle, colapsa espaços, limita comprimento.
- `sanitizeSubjectName` (≤40) e `sanitizeNote` (≤120).
- `sanitizeColor` — exige hex válido (regex), senão fallback seguro.
- `clampNumber` / `sanitizeGoalHours` — limita faixas numéricas.
- `isDuplicateSubject` — unicidade case-insensitive.

Aplicado no cadastro, no registro manual, na edição de comentário **e na importação de backup**.

### 2.2 Saída segura (mitigação XSS)
- `src/ui/dom.ts` — `el()`/`mount()` escrevem via **`textContent`**.
- `svg()` aceita apenas markup estático autoral (ícones), nunca dado do usuário.
- Nenhum `innerHTML` com conteúdo não confiável em todo o código-base.

### 2.3 Transporte e headers
- **HTTPS** obrigatório em produção (GitHub Pages entrega por padrão).
- **CSP** via meta tag:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:;
  connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  ```
  - `script-src 'self'` → sem scripts inline de terceiros.
  - `connect-src 'self'` → o app não fala com domínios externos (fontes via `font-src`, controlado).
- Recomendação: reforçar com headers HTTP no hosting (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) — ver `DEPLOYMENT.md`.

### 2.4 Dependências
- Runtime: **zero**.
- Build/dev: gerenciadas via `package-lock.json`; executar `npm audit` na CI.

## 3. Recomendações (não aplicáveis ou futuro)

- **MFA / hash de senha / rate limiting / secret management:** não aplicáveis — não existem contas, senhas, endpoints nem segredos.
- **Backup de dados:** manual (exportação JSON) e sob controle do usuário; recomenda-se exportar periodicamente.
- **Integridade de backup:** se evoluir para sync, assinar o payload (HMAC) para detectar adulteração.

## 4. Auditoria executada

- Revisão de todos os pontos de inserção de dados do usuário (XSS).
- Revisão de validação na fronteira (domínio + import).
- Revisão de CSP e ausência de sinks perigosos (`eval`, `innerHTML` dinâmico, `fetch` de URL do usuário).
- Testes de segurança automatizados:
  - import de backup hostil não corrompe o estado (`tests/unit/backup.test.ts`);
  - cor maliciosa normalizada (`tests/unit/storage.test.ts`);
  - validação de entradas (`tests/unit/validation.test.ts`);
  - autorização/negativo: tempo manual = 0 rejeitado, duplicata rejeitada, nome vazio rejeitado (`tests/e2e/app.spec.ts`).

## 5. Verificação final do Tech Lead (segurança)

1. Algum dado sai do dispositivo? **Não.**
2. Existe `innerHTML` com dado do usuário? **Não.**
3. Toda entrada é validada (inclusive backup)? **Sim.**
4. Há secrets no código? **Não.**
5. CSP presente e restritiva? **Sim.**
6. Dependências de runtime? **Zero.**
