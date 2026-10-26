# Arquitetura

> **DECISION:** SPA local-first com Vite + TypeScript (vanilla, zero dependências de runtime), lógica em camadas e persistência em `localStorage` versionado.
>
> **REASON:** aplicação pessoal single-user, sem requisito de contas/sync. TypeScript entrega tipagem e testabilidade; sem framework, a superfície de segurança e o bundle são mínimos.
>
> **IMPACT:** domínio puro e altamente testável; UI imperativa com helpers seguros; persistência abstraída (troca futura por IndexedDB sem tocar nos consumidores).
>
> **ALTERNATIVES:** React/Svelte (overhead não justificado para uma página); Backend + Postgres (custo e complexidade desnecessários para uso pessoal).
>
> **WHY NOT:** "não escolher tecnologia por moda" — prioridades são performance, manutenção e segurança.

## 1. Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│  UI  (src/ui)                                               │
│   app.ts (composição) · dom.ts (helpers XSS-safe)           │
│   components/ toast · modal · chart                          │
│   responsabilidades: render, eventos, foco, acessibilidade   │
├─────────────────────────────────────────────────────────────┤
│  DOMAIN  (src/domain)  — puro, sem efeitos colaterais       │
│   models · timer · stats · time · validation                 │
│   responsabilidades: regras de negócio e invariantes         │
├─────────────────────────────────────────────────────────────┤
│  INFRA  (src/infra)  — adaptadores                           │
│   storage (leitura defensiva + migração) · backup            │
│   responsabilidades: serialização e fronteira de confiança   │
├─────────────────────────────────────────────────────────────┤
│  Browser: localStorage  ·  Cache API (Service Worker)        │
└─────────────────────────────────────────────────────────────┘
```

Regras de dependência (impostas por convenção + `tsconfig`):
- `domain` não importa `ui` nem `infra` (nem DOM).
- `ui` importa `domain` e `infra`.
- `infra` importa `domain`.
- `domain` é 100% testável sem navegador.

## 2. Modelo de dados (domínio)

Ver [`DATABASE.md`](DATABASE.md) para o esquema persistido.

- **Subject** — matérias coloridas (`id`, `name`, `color`, `createdAt`).
- **Session** — um estudo registrado (`durationSec > 0`, `at`, `note`, `source: timer|manual`, `subjectId|null`).
- **TimerState** — cronômetro derivado de timestamps (`running`, `startedAt`, `baseSec`).
- **Settings** — meta, tema, intervalo do gráfico, filtro do histórico.
- **AppState** — agregado versionado (`version`, subjects, sessions, timer, settings).

### Invariantes de domínio
1. Sessão válida sempre tem `durationSec > 0` e `at` plausível.
2. `elapsedSec(timer, now)` nunca é negativo e é função pura do relógio (não conta ticks).
3. Todo cronômetro carrega **pausado** (nunca "resume" sozinho após recarregar).
4. Sessão só aponta para matéria existente ou `null` ("Geral").

## 3. Cronômetro: pausa automática ao sair

O tempo decorrido é **derivado de timestamps**, não de contadores incrementais:

```
elapsed = baseSec + (now - startedAt)/1000   [se running]
elapsed = baseSec                             [se pausado]
```

Gatilhos de pausa (satisfaz "pausa ao sair do site"):
- `visibilitychange` → `hidden` (trocou de aba/janelou o app)
- `pagehide` (fechar/recarregar a página)
- carregamento do app (`loadState` força `running=false`)

Isso torna o relógio imune a throttling de timers em segundo plano e consistente após reload.

## 4. Ciclo de renderização

Duas rotas para manter o relógio suave sem reconstruir o DOM:

- **`renderAll()`** — renderização estrutural (lista, histórico, gráfico, chips, selects). Executada apenas em `commit()` (após mutação + persistência).
- **`renderLive()`** — atualizações baratas por tick (250 ms): `textContent` do relógio, pílula de estado, barra de meta e cartões de estatística.

Estatísticas "ao vivo": enquanto o cronômetro roda, uma **sessão virtual** (não persistida) entra no cálculo de total/hoje/semana/gráfico, para a barra de progresso animar em tempo real.

## 5. Tratamento de erros

- **Storage indisponível/corrompido** → `normalizeState` devolve estado padrão; app sempre inicia.
- **Quota excedida** → `saveState` retorna `false` e o indicador "Salvo neste navegador" sinaliza falha.
- **Import de backup inválido** → erro controlado via toast, nunca exceção não tratada.
- **Service worker** falhando → degradação silenciosa (é aprimoramento progressivo).

## 6. Estratégia de escalabilidade

O sistema é **estático e local-first** — "escala" horizontalmente por CDN/hosts estáticos (custo ~zero) e não há servidor para dimensionar. Pontos de extensão futuros preservados:

- **Troca de storage:** `StorageAdapter` isola `localStorage` → migrar para IndexedDB não altera `ui/`.
- **Novas métricas:** funções puras em `stats.ts` + cartão correspondente.
- **Sync multi-dispositivo:** introduzir backend exigiria apenas um adaptador de persistência remoto e resolução de conflitos; a camada de domínio permaneceria intacta.

## 7. Padrões e qualidade de código

- **SOLID / Separation of Concerns:** domínio, infra e UI estritamente separados.
- **DRY:** helpers reutilizados (`formatDuration`, `sanitizeText`, `el/mount`).
- **KISS:** sem abstrações prematuras; sem framework.
- **Fail Fast:** validação na fronteira rejeita entrada inválida imediatamente.
- **Secure by Default:** entrada não confiável sempre sanitizada; texto sempre via `textContent`.
- Tipagem `strict`, funções pequenas, sem código duplicado, comentários apenas onde agregam.

## 8. Dependências entre módulos

```
main.ts ─▶ ui/app.ts ─▶ domain/* , infra/* , ui/dom.ts , ui/components/*
                         │
                         ├─ domain/models.ts ◀─ todos (tipos)
                         ├─ domain/validation.ts ◀─ infra/storage, infra/backup, ui/app
                         ├─ domain/timer.ts ◀─ infra/storage (freeze), ui/app
                         └─ domain/time.ts , domain/stats.ts ◀─ ui/app, components/chart
```

Nenhum ciclo de dependência.
