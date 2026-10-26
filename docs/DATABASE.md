# Banco de Dados (Persistência)

Não há SGBD: o sistema é **local-first** e persiste em **`localStorage`** no navegador. Este documento descreve o esquema, as regras de integridade, a migração e a estratégia de backup/retenção.

## 1. Chave de armazenamento

| Item | Valor |
|------|-------|
| Chave | `cronometroEstudos` |
| Formato | JSON (string) |
| Escopo | Origem do navegador (por domínio/porta) |
| Schema versionado | `version` (atual: `1`) |

## 2. Entidades e relacionamentos

```
Subject 1 ──── N Session        (Session.subjectId → Subject.id | null)
TimerState (singleton, 0..1 por AppState)
Settings  (singleton, 1 por AppState)
AppState  (agregado raiz: version + subjects[] + sessions[] + timer + settings)
```

**Cardinalidade:** um estudo (`Session`) pertence a **uma** matéria ou a nenhuma (`null` = "Geral"). Uma matéria pode ter **N** estudos. Um app local mantém **1** `AppState`.

## 3. Esquema (shapes)

### Subject
| Campo | Tipo | Restrição |
|-------|------|-----------|
| `id` | string | obrigatório, único |
| `name` | string | 1–40 chars, trim, único case-insensitive |
| `color` | string | hex `#rgb`/`#rrggbb` (validado; senão fallback) |
| `createdAt` | number | epoch ms, > 0 |

### Session
| Campo | Tipo | Restrição |
|-------|------|-----------|
| `id` | string | obrigatório, único |
| `subjectId` | string \| null | FK → Subject.id ou null |
| `durationSec` | number | **inteiro > 0** |
| `at` | number | epoch ms plausível (> 0, < 8.64e13) |
| `note` | string | 0–120 chars, sanitizado |
| `source` | `"timer" \| "manual"` | default `timer` |

### TimerState
| Campo | Tipo | Nota |
|-------|------|------|
| `running` | boolean | **forçado `false` na carga** (nunca resume) |
| `subjectId` | string \| null | matéria atual do cronômetro |
| `startedAt` | number | epoch ms do início da sessão atual (0 se pausado) |
| `baseSec` | number | segundos acumulados de execuções anteriores |
| `updatedAt` | number | epoch ms da última atualização |

### Settings
| Campo | Tipo | Limites |
|-------|------|---------|
| `goalHours` | number | 0.5–24 (default 4) |
| `theme` | `"dark" \| "light"` | default `dark` |
| `chartRange` | `"week" \| "total"` | default `week` |
| `historyFilter` | string | `"all"` \| subject.id |

## 4. Integridade (garantidas na camada de domínio/infra)

Apesar de não haver constraints de SGBD, a **leitura defensiva** (`normalizeState`) restabelece a integridade a cada carga:

- Sessão inválida (`durationSec ≤ 0` ou `at` inválida) é **descartada**.
- Cor inválida é **normalizada** para o fallback da paleta.
- Sessão que aponta para matéria inexistente é **descartada** (FK órfã).
- Nome duplicado (case-insensitive) é **rejeitado** no cadastro.
- `goalHours` fora dos limites é **rebaixado** aos limites.
- Timer carrega sempre **pausado**.

Essas mesmas regras são aplicadas **também na importação de backup**, impedindo que arquivo hostil injete dados inválidos.

## 5. Migração

- `version` armazenada em `AppState`.
- `migrate()` normaliza payloads antigos; **forma legada** (top-level `goalHours`/`theme`/`chartRange` antes de `settings`) ainda é lida.
- Versão **desconhecida/futura**: leitura *best-effort* dos campos conhecidos (nunca quebra).
- Novas versões: incrementar `SCHEMA_VERSION` (`src/domain/models.ts`) e adicionar ramo em `migrate()`.

## 6. Índices / padrões de consulta

`localStorage` não tem índices; consultas são lineares (`Array.filter/reduce`) sobre conjuntos pequenos (uso pessoal). Padrões dominantes:
- filtro por matéria (`historyFilter`),
- agregação por dia/semana (usa chave de dia local),
- agrupamento por matéria (gráfico).

Limite teto gravado: **5000 sessões** (`saveState` faz `slice`), evitando crescimento descontrolado do valor da chave.

## 7. Backup, retenção e crescimento

| Tema | Estratégia |
|------|-----------|
| **Backup** | Exportação JSON (`app`, `exportedAt`, `data`) via botão no topo; importação com validação completa. |
| **Retenção** | Sem expiração automática (é dado pessoal do usuário). Limpeza manual: "Limpar histórico" ou exclusão individual. |
| **Crescimento** | Limitado a 5000 sessões; ~200 bytes/sessão → teto ~1 MB, dentro do orçamento típico de 5 MB por origem. |
| **Descarte de dados** | Excluir matéria move seus estudos para "Geral" (não destrutivo), preservando o histórico. |

> **Privacidade:** nada é enviado a servidores. Sem sincronização automática — o backup é manual e sob controle do usuário.

## 8. Migração futura para IndexedDB

`StorageAdapter` (`getItem/setItem/removeItem`) isola a API. Substituir a implementação por IndexedDB não altera `ui/` nem `domain/`; apenas `loadState/saveState` mudam internamente.
