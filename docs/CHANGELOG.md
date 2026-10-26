# Changelog

Todas as mudanças notáveis neste projeto seguem [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Formato de versionamento: [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [2.0.0] — 2026-10-26

Reescrita completa do zero por uma equipe de engenharia sênior, transformando o app monolítico (v1) em um sistema modular, testado, documentado e preparado para manutenção.

### ✨ Adicionado
- **Comentário no último estudo** — cartão dedicado com edição rápida do estudo mais recente (requisito explícito).
- **Sequência (streak)** — novo cartão de estatística com dias consecutivos estudando.
- **Backup export/import** — download e restauração de JSON validado.
- **Edição de matérias** — renomear e alterar cor existentes.
- **Origem da sessão** — selo "cronômetro" / "manual" no histórico.
- **PWA offline** — manifest + service worker (instalável e funcional offline).
- **Atalho de teclado** — barra de espaço alterna o cronômetro.
- **Acessibilidade** — semântica, ARIA, navegação por teclado, foco visível, `prefers-reduced-motion`.

### 🔄 Alterado
- **Arquitetura em camadas** — `domain/` (puro), `infra/` (storage+backup), `ui/` (composição).
- **Cronômetro por timestamps** — preciso e imune a throttling; pausa automática em `visibilitychange`/`pagehide`.
- **Build com Vite + TypeScript strict** — zero dependências de runtime, ~9 KB gzip.
- **Base relativa** — o build funciona na raiz ou em sub-pasta (GitHub Pages).

### 🐛 Corrigido
- **Estado vazio do cartão de comentário** ficava visível junto ao editor — atributo `hidden` sobrescrito pelo CSS de componente. Corrigido com regra global `[hidden] { display: none !important }` (capturado na revisão visual).

### 🧪 Testado
- 61 testes unitários (Vitest) + 16 testes E2E (Playwright).

### 📚 Documentado
- `README`, `ARCHITECTURE`, `DATABASE`, `SECURITY`, `DEPLOYMENT`, `CHANGELOG`.

---

## [1.0.0] — versão anterior

Primeira versão: app vanilla HTML/CSS/JS monolítico (`index.html`, `script.js`, `style.css`) com cronômetro, matérias, histórico, estatísticas e meta, persistindo em `localStorage`.

> O repositório havia tido todos os arquivos removidos no commit final; esta versão 2.0.0 reconstrói o produto com engenharia profissional.
