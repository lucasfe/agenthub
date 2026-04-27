# RALPH_PACKAGE_PLAN.md

Plano de design e implementação para transformar o Ralph loop (hoje acoplado ao `agenthub`) em um pacote npm reusável `@lucasfe/ralph`.

Documento gerado a partir de uma sessão de grilling de 17 decisões. Todas as decisões abaixo estão **travadas** — o objetivo deste documento é servir de input para a PRD/implementação, não para reabrir discussão arquitetural.

---

## 1. Visão geral

**Problema:** O Ralph existe hoje como 4 arquivos no `agenthub` (`ralph.sh`, `start-ralph.sh`, `PROMPT.md`, `.claude/commands/ralph.md`) que executam um loop autônomo: pegam a próxima issue aberta do GitHub, invocam Claude Code para resolvê-la, abrem PR, fazem auto-merge, notificam via WhatsApp. Funciona muito bem no `agenthub`, mas está acoplado a este projeto (paths absolutos, `npm ci`/`npm test` hardcoded, referências ao `CLAUDE.md` deste repo).

**Solução:** Empacotar como `@lucasfe/ralph` no npm público, instalável via `npm i -g @lucasfe/ralph` ou usável via `npx @lucasfe/ralph`. Cada projeto roda `ralph init` uma vez, autodetecta o stack, e tem o loop disponível com `ralph start`. Atualizações chegam via `npm update`.

**Princípio de design:** zero perguntas no `init`, suporte a qualquer linguagem via autodetecção + delegação ao Claude. Configuração lazy: `ralph init` gera defaults; primeira execução pede ao Claude para validar e ajustar a config; estado validado fica em `.ralph/state.json` (gitignored, hash-based invalidation).

---

## 2. Decisões travadas (17)

### D1 — Modelo de distribuição: pacote npm com CLI

`@lucasfe/ralph` publicado no npm público. Comando único `ralph` instalado globalmente (`npm i -g`) ou invocável via `npx @lucasfe/ralph`. Loop em si continua sendo bash (templates dentro do pacote); o pacote é um wrapper Node que faz sanity checks, gerencia config, dispara `tmux` com o `ralph.sh` template.

### D2 — Hospedagem: npm público com escopo

Nome: `@lucasfe/ralph`. Permite suite futura (`@lucasfe/ralph-notifiers-slack`, `@lucasfe/ralph-presets-react`) sem chocar com nomes globais. Publish via GitHub Actions em push de tag `ralph-v*`.

### D3 — Localização do código-fonte: monorepo no `agenthub`

`packages/ralph/` dentro do repo `agenthub` por enquanto. No futuro pode mover para `lucasfe/ralph` standalone, mas não bloqueia v0.1.

### D4 — UX da CLI: subcomandos

Comando único `ralph` com subcomandos:
- `ralph init` — instala no projeto atual (cria config, templates, slash command)
- `ralph start` — sanity checks + dispara `tmux` com o loop
- `ralph stop` — mata sessão `tmux`
- `ralph doctor` — checa OS, deps, auth, projeto

Subcomandos `status`, `logs`, `upgrade` ficam pra v0.2 (substituídos por `tmux attach -t ralph` e `tail logs/*.log` na v0.1).

### D5 — Autodetecção de stack: zero perguntas, fallback no Claude

`ralph init` varre arquivos-marcador e gera `ralph.config.sh` com defaults:

| Manifest | INSTALL_CMD | TEST_CMD | LINT_CMD |
|---|---|---|---|
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` | `pnpm test` | `pnpm lint` |
| `yarn.lock` | `yarn install --frozen-lockfile` | `yarn test` | `yarn lint` |
| `package.json` | `npm ci` | `npm test` | `npm run lint` |
| `pyproject.toml` | `pip install -e .` | `pytest` | `ruff check .` |
| `requirements.txt` | `pip install -r requirements.txt` | `pytest` | `` |
| `go.mod` | `go mod download` | `go test ./...` | `go vet ./...` |
| `Cargo.toml` | `cargo fetch` | `cargo test` | `cargo clippy` |
| `Gemfile` | `bundle install` | `bundle exec rake test` | `` |
| `composer.json` | `composer install` | `composer test` | `` |
| (nenhum) | `` | `` | `` |

Quando vazio, o `prompt-base.md` instrui o Claude: *"Se TEST_CMD vazio, detecte os testes pelo manifest e rode a forma idiomática. Se não houver testes, pule esta etapa."*

`init` imprime o que detectou no terminal, sem prompt interativo. Quando nada é detectado, mostra aviso amarelo "nenhum manifest reconhecido — config vazia, edite `ralph.config.sh` ou rode mesmo assim que o Claude detecta na execução".

### D6 — Validação lazy: one-shot Claude na primeira execução

Estado de validação vive em `.ralph/state.json` (gitignored), separado de `ralph.config.sh` (commitado).

```json
{
  "config_hash": "<sha256 do ralph.config.sh>",
  "validated_at": "2026-04-26T14:30:00Z",
  "ralph_version": "0.1.0",
  "detected_stack": "node",
  "notes": "Ajustei TEST_CMD de 'npm test' para 'vitest run' porque package.json usa vitest"
}
```

Toda execução do `ralph.sh`:
1. Calcula `sha256(ralph.config.sh)`.
2. Compara com `state.json`. Se diferente (ou ralph_version diferente, ou state.json ausente):
3. Invoca `claude -p < templates/validate-config.md`. Esse prompt instrui Claude a:
   - Ler `ralph.config.sh` + manifests do projeto
   - Verificar se INSTALL_CMD/TEST_CMD/LINT_CMD são plausíveis e funcionam
   - Corrigir `ralph.config.sh` se necessário
   - Gravar `.ralph/state.json` com novo hash, timestamp, stack detectado, notas
4. Segue para o loop normal.

Reset trivial: `rm -rf .ralph` força revalidação. `.ralph/` no `.gitignore` (per-machine).

### D7 — `PROMPT.md`: base no pacote + adendo no projeto

`templates/prompt-base.md` (no pacote, atualizável) contém:
- Sequência obrigatória de 8 passos (selecionar issue → marcar label → branch → resolver → validar → commit → PR → auto-merge polling)
- Restrições absolutas (no force push, no rm -rf, no escape de PROJECT_ROOT, no `gh pr merge` sem `--auto`, no `gh issue close` manual)
- Bloco de falha
- Placeholder `{{PROJECT_PROMPT}}` no final

`PROMPT.md` (no projeto, ~15 linhas, criado pelo `init`) contém apenas o adendo:
- Stack do projeto (ex: "React 19 + Vite + Tailwind, JS puro")
- MCPs disponíveis (ex: "mcp__supabase__* — use quando issue envolver banco")
- Sub-agentes via slash command (ex: "/project:frontend, /project:backend, /project:qa, /project:docs")
- Restrições extras específicas

Em runtime, `ralph.sh` interpola `{{PROJECT_PROMPT}}` com conteúdo de `./PROMPT.md` antes de mandar pro Claude. Updates em `prompt-base.md` (bug fixes, melhorias) chegam de graça via `npm update`.

### D8 — Notificações: WhatsApp built-in + hook genérico

`ralph.sh` no fim do loop:
1. **Built-in:** se `.env.local` define `CALLMEBOT_KEY` + `WHATSAPP_PHONE`, envia via CallMeBot.
2. **Hook custom:** se `./ralph-notify.sh` existe e é executável, chama com args `(msg, status, ok_count, fail_count, duration_min)`.
3. **Sempre:** imprime no stdout (visível em `tmux attach`).

`init` cria `ralph-notify.sh.example` e `.env.local.example` com templates comentados (Slack, Discord, macOS native, sendmail). Ambos vão pro `.gitignore`.

`ralph init` imprime instruções de configuração do WhatsApp:
> Para receber notificações no WhatsApp:
> 1. Adicione o bot CallMeBot: https://www.callmebot.com/blog/free-api-whatsapp-messages/
> 2. Crie `.env.local` com `CALLMEBOT_KEY=...` e `WHATSAPP_PHONE=...`
> 3. (Opcional) `.gitignore` já bloqueia `.env.local`

### D9 — Restrições de path: `git rev-parse --show-toplevel` + `cd`

`ralph.sh` no início:
```sh
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$PROJECT_ROOT"
export PROJECT_ROOT
```

Aborta se `PROJECT_ROOT` não for repo git. Aborta se for `$HOME` ou `/`.

`prompt-base.md`:
> NUNCA editar, criar ou deletar arquivos fora de `{{PROJECT_ROOT}}` (resolvido em runtime).
> NUNCA rodar comandos Bash que toquem arquivos fora de `{{PROJECT_ROOT}}`.

Defesa em profundidade: o `cd "$PROJECT_ROOT"` garante que paths relativos do Claude resolvam dentro do projeto, mesmo se a string interpolada for ignorada.

### D10 — Branches e merge: defaults autodetectados, tudo em config

Variáveis no `ralph.config.sh`:
```sh
MAIN_BRANCH="main"          # autodetectado: git symbolic-ref refs/remotes/origin/HEAD
DEV_BRANCH="dev"            # autodetectado: existe origin/dev|develop? senão = MAIN_BRANCH
PR_TARGET="dev"             # default = DEV_BRANCH
MERGE_STRATEGY="squash"     # squash | merge | rebase
AUTO_MERGE="true"           # se false: abre PR, marca claude-pr-open, segue próxima issue
MERGE_POLL_INTERVAL=30      # segundos
MERGE_POLL_MAX=40           # máx 40 polls = 20min
```

`AUTO_MERGE="false"` mode (com label `claude-pr-open`) **fica pra v0.2** — v0.1 só implementa AUTO_MERGE=true.

Filtro de fila no `ralph.sh`:
```sh
label_filter=(--label '-claude-working' --label '-claude-failed' --label '-claude-pr-open')
```

Quando AUTO_MERGE=false, o loop continua processando próximas issues (não para depois de 1 PR aberto) — a fila de review humano vai do tamanho que precisar.

### D11 — Atualização: update check no start + suporte a pin

`ralph start` faz `npm view @lucasfe/ralph version` (timeout 5s, falha silenciosa). Se houver versão nova:
- Imprime aviso *uma vez por release*.
- Persiste em `.ralph/state.json` (`last_seen_release: "0.2.0"`); avisa de novo só quando aparecer 0.3.0+.

Suporte opcional a pin via `RALPH_VERSION="0.1.0"` no `ralph.config.sh` (útil pra CI/time alinhado). Quando setado, `ralph start` re-invoca via `npx @lucasfe/ralph@<versão>` em vez do `ralph` global. **Pin fica pra v0.2** — v0.1 implementa só o update check (avisar).

Quando `ralph_version` no `state.json` ≠ versão instalada, força revalidação lazy (D6) — campo `config_hash` é zerado.

Versionamento semver disciplinado:
- **patch** (0.1.0 → 0.1.1): bug fix sem mudança de comportamento
- **minor** (0.1.0 → 0.2.0): nova feature, nova variável de config (com default que preserva)
- **major** (0.x → 1.0): breaking change com guia de migração no CHANGELOG

### D12 — Slash command: per-projeto, conteúdo minimalista

`ralph init` cria `.claude/commands/ralph.md` no projeto (commitado, viaja com o repo). Conteúdo é fino — só instrui a chamar `ralph start` via Bash e reportar o output. Drift desse arquivo não dói porque tem ~20 linhas e zero lógica.

`init` **pula se o arquivo já existe**, imprime aviso "rode `ralph upgrade` se quiser atualizar". `init` é instalação, `upgrade` é manutenção (`upgrade` fica pra v0.2).

### D13 — OS suportados: Mac + Linux + WSL; deps via mensagem clara

Suporte oficial: macOS, Linux, WSL2 no Windows. Windows nativo não suportado (requer reescrever `ralph.sh` em cross-platform).

Deps de sistema obrigatórias: `git`, `gh`, `tmux`, `jq`, `curl`, `claude` (CLI), `npm`/`node`.

`ralph doctor` checa cada uma e imprime comando exato de instalação por OS. `ralph start` roda check inline antes de disparar; aborta se críticas faltam (`git`, `gh`, `tmux`, `claude`). **Nunca instala automaticamente.** Mostrar comando pro usuário copiar é a fronteira.

Cross-platform notes no `ralph.sh`:
- `sha256` helper: `command -v sha256sum >/dev/null && sha256sum "$@" || shasum -a 256 "$@"` (Mac usa `shasum`, Linux usa `sha256sum`)
- Evitar `sed -i ''` vs `sed -i` (diferenças GNU/BSD): usar `awk` ou Node nas substituições
- Compatível com bash 3.2 (Mac default) — não usar arrays associativos

### D14 — Escopo MVP (v0.1.0)

| Feature | v0.1.0 |
|---|---|
| `ralph init` (autodetect + state.json) | ✅ |
| `ralph start` (sanity + tmux + ralph.sh) | ✅ |
| `ralph stop` | ✅ |
| `ralph doctor` | ✅ |
| `--version`, `--help` | ✅ |
| Autodetect: node/python/go/rust/ruby/php/pnpm/yarn | ✅ |
| Validação lazy via Claude (D6) | ✅ |
| `prompt-base.md` no pacote + adendo no projeto | ✅ |
| Branch autodetect + AUTO_MERGE=true | ✅ |
| WhatsApp built-in + `ralph-notify.sh` hook | ✅ |
| Update check (avisa 1x por release) | ✅ |
| Mac/Linux/WSL | ✅ |
| Slash command no init | ✅ |
| CI/CD publish (GH Actions tag → npm) | ✅ |
| Unit tests JS (vitest) | ✅ Mínimo |
| `ralph status` / `logs` | ❌ (use `tmux attach` / `tail`) |
| `ralph upgrade` | ❌ |
| `RALPH_VERSION` pin | ❌ |
| `AUTO_MERGE=false` + `claude-pr-open` | ❌ |

**v0.2:** `ralph upgrade` (com diff de templates), `status`, `logs`, `AUTO_MERGE=false`, pin via `RALPH_VERSION`.

**v0.3:** presets (`--preset react`), plugin system de notifiers (separados em sub-pacotes).

**v1.0:** API congelada, depois de 6 meses estável.

### D15 — Testes: unit JS + dogfood agressivo

**v0.1:** apenas unit tests do código JS (vitest):
- `lib/detect-stack.test.js` — autodetect por manifest
- `lib/init.test.js` — geração de config e templates
- `lib/doctor.test.js` — branches de deps faltando
- `lib/interpolate.test.js` — substituição de placeholders
- `lib/update-check.test.js` — dedup por release
- ~30 testes, ~200 linhas

Bash (`ralph.sh`), templates de prompt e validação via Claude **não testados em CI**. Cobertura via dogfood: você usa em `agenthub` durante todo desenvolvimento (D16), depois em 1 outro projeto antes do publish.

Smoke test manual antes de release (documentado em `CONTRIBUTING.md`):
```
npm pack
npm i -g ./ralph-X.Y.Z.tgz
cd ~/repos/outro-projeto
ralph init
ralph doctor
gh issue create -t "test" -b "test"
ralph start  # confere fluxo completo
ralph stop
```

**v0.2+:** adicionar `bats` para testes de bash quando dor real surgir. **v0.3+:** e2e com Claude real em CI semanal manual quando houver release frequente.

### D16 — Migração do `agenthub`: dogfood desde o dia 1, em 9 etapas

Desenvolvimento do pacote *substitui* o bash local desde o primeiro commit. Bash antigo só some quando o equivalente novo está funcional. Rollback via `git revert` é instantâneo.

| Etapa | Conteúdo | Tempo |
|---|---|---|
| 0 | Scaffold `packages/ralph/` (package.json, README, bin stub) | 30min |
| 1 | `bin/ralph.js` `start` chama o `ralph.sh` raiz; deleta `start-ralph.sh`; atualiza slash command | 2h |
| 2 | Move `ralph.sh` raiz → `packages/ralph/templates/ralph.sh`; `bin/ralph.js` resolve path | 1h |
| 3 | Implementa `init`, `doctor`, autodetect, `validate-config.md`, state.json | 1d |
| 4 | Quebra `PROMPT.md` em `prompt-base.md` (no pacote) + adendo (no projeto, ~15 linhas) | 3h |
| 5 | WhatsApp built-in + hook `ralph-notify.sh`; templates `.example` | 2h |
| 6 | Update check + bump pra `0.1.0-rc.1` | 2h |
| 7 | Unit tests (vitest) — 30 testes em `lib/*.test.js` | 3h |
| 8 | README, CHANGELOG, smoke test em outro projeto, ajustes | 1d |
| 9 | CI publish workflow (`.github/workflows/ralph-publish.yml`); tag `ralph-v0.1.0`; publish; trocar slash command para `ralph start` global | 30min |

**Total: ~5 dias de trabalho focado, ~1-2 semanas calendário.**

Diff final no `agenthub`:
```
- ralph.sh                                    [→ packages/ralph/templates/]
- start-ralph.sh                              [deletado, lógica em bin/ralph.js]
- PROMPT.md                                   [60 → ~15 linhas (só adendo)]
+ ralph.config.sh                             [novo, commitado]
+ .ralph/state.json                           [novo, gitignored]
+ .env.local.example                          [novo, commitado]
+ ralph-notify.sh.example                     [novo, commitado]
+ packages/ralph/                             [todo o pacote]
~ .claude/commands/ralph.md                   [substituído pelo template]
~ .gitignore                                  [+.ralph/, +ralph-notify.sh]
```

### D17 — Estrutura interna do pacote

**Runtime:** Node puro (≥18). Sem build step.

**Deps de produção:**
- `commander@^12` — parser de subcomandos com `--help` autogerado
- `execa@^9` — spawn de processos (`gh`, `git`, `tmux`, `npm view`) com promises e error handling decente
- `picocolors@^1` — cores no terminal (5kb)

**Deps de dev:**
- `vitest@^2`
- `memfs@^4` — fs in-memory para unit tests de autodetect

**Sem deps:** parsing manual de args, fs-extra, chalk, fs-promises (nativo já basta).

**Layout:**
```
packages/ralph/
├── package.json
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── .npmignore
├── bin/
│   └── ralph.js                  # ~50 linhas: shebang + commander + dispatch
├── lib/
│   ├── commands/
│   │   ├── init.js
│   │   ├── start.js
│   │   ├── stop.js
│   │   └── doctor.js
│   ├── detect-stack.js           # autodetect manifests → install/test/lint
│   ├── interpolate.js            # {{PROJECT_ROOT}} etc. em templates
│   ├── update-check.js           # npm view + dedup por release
│   ├── platform.js               # detect mac/linux/wsl
│   ├── deps.js                   # commandExists, REQUIRED_DEPS
│   ├── state.js                  # read/write .ralph/state.json + hash config
│   ├── config.js                 # parseia ralph.config.sh (regex simples)
│   ├── paths.js                  # RALPH_HOME, TEMPLATES_DIR resolvidos
│   ├── log.js                    # picocolors helpers (ok/warn/err/info)
│   └── *.test.js                 # co-located
├── templates/
│   ├── ralph.sh                  # bash do loop, placeholders {{...}}
│   ├── prompt-base.md
│   ├── PROMPT.md                 # adendo template (curto)
│   ├── ralph.config.sh
│   ├── slash-command.md          # → .claude/commands/ralph.md
│   ├── validate-config.md        # one-shot validação inicial
│   ├── ralph-notify.sh.example
│   └── env.local.example
└── vitest.config.js
```

**`package.json`:**
```json
{
  "name": "@lucasfe/ralph",
  "version": "0.1.0",
  "description": "Autonomous loop that resolves GitHub issues one at a time using Claude Code.",
  "type": "module",
  "bin": { "ralph": "./bin/ralph.js" },
  "files": ["bin", "lib", "templates", "README.md", "CHANGELOG.md"],
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "execa": "^9.0.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "memfs": "^4.0.0"
  },
  "keywords": ["claude", "claude-code", "automation", "github", "issues", "agent", "loop"],
  "repository": {
    "type": "git",
    "url": "https://github.com/lucasfe/agenthub.git",
    "directory": "packages/ralph"
  },
  "publishConfig": { "access": "public" },
  "license": "MIT"
}
```

**`bin/ralph.js`:**
```js
#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { init }   from '../lib/commands/init.js';
import { start }  from '../lib/commands/start.js';
import { stop }   from '../lib/commands/stop.js';
import { doctor } from '../lib/commands/doctor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const program = new Command();
program.name('ralph').description('Autonomous GitHub issue resolver loop').version(pkg.version);
program.command('init').description('Initialize Ralph in the current project').option('--force').action(init);
program.command('start').description('Start the Ralph loop in a tmux session').action(start);
program.command('stop').description('Kill the running Ralph tmux session').action(stop);
program.command('doctor').description('Check environment, dependencies, and project setup').action(doctor);
program.parseAsync(process.argv);
```

**Resolução de templates:**
```js
// lib/paths.js
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const RALPH_HOME = join(__dirname, '..');
export const TEMPLATES_DIR = join(RALPH_HOME, 'templates');
```

Funciona com install global, npx, ou desenvolvimento local — sem env var.

---

## 3. Schemas e formatos importantes

### 3.1 — `ralph.config.sh` (commitado)

```sh
# ===========================================================================
# Ralph configuration for this project
# Generated by `ralph init`. Edit freely; the LLM validator will revise on
# first run and update .ralph/state.json with whatever it adjusted.
# ===========================================================================

# --- Stack commands -------------------------------------------------------
INSTALL_CMD="npm ci"
TEST_CMD="npm test"
LINT_CMD="npm run lint"

# --- Branches (autodetected) ---------------------------------------------
MAIN_BRANCH="main"
DEV_BRANCH="dev"
PR_TARGET="dev"

# --- Merge strategy -------------------------------------------------------
MERGE_STRATEGY="squash"      # squash | merge | rebase
AUTO_MERGE="true"            # v0.1.0: only true is implemented
MERGE_POLL_INTERVAL=30
MERGE_POLL_MAX=40

# --- (Optional) pin Ralph version (v0.2.0+) ------------------------------
# RALPH_VERSION="0.1.0"
```

### 3.2 — `.ralph/state.json` (gitignored)

```json
{
  "config_hash": "8f3b9c1a...",
  "validated_at": "2026-04-26T14:30:00Z",
  "ralph_version": "0.1.0",
  "detected_stack": "node",
  "notes": "TEST_CMD adjusted from 'npm test' to 'vitest run' (project uses vitest directly).",
  "last_seen_release": "0.1.0"
}
```

### 3.3 — `prompt-base.md` (no pacote, com placeholders)

```md
# Ralph Loop — Resolver próxima issue do GitHub

Você é um agente autônomo num loop de resolução de issues. Cada execução sua processa UMA issue do começo ao fim. Quando terminar, saia.

## Sequência obrigatória

0. **Garantir deps**: rode `{{INSTALL_CMD}}` se definido; senão detecte e rode.
1. **Selecionar issue**: `gh issue list --state open --label '-claude-working' --label '-claude-failed' --label '-claude-pr-open' --sort created --order asc --limit 1 --json number,title,body`
2. **Marcar em andamento**: `gh issue edit N --add-label claude-working`
3. **Branch**: `git checkout {{DEV_BRANCH}} && git pull && git checkout -b issue-N`
4. **Resolver**: leia título + body, implemente. Use Read/Edit/Write. Siga `CLAUDE.md` se existir.
5. **Validar**: rode `{{TEST_CMD}}` e `{{LINT_CMD}}` se definidos; senão detecte e rode. Máx 3 tentativas.
6. **Commit + push**: `git commit -m "<descricao> (#N)" && git push -u origin issue-N`
7. **PR**: `gh pr create --base {{PR_TARGET}} --head issue-N --title "<titulo>" --body "Closes #N"`
8. **Auto-merge**: `gh pr merge <pr> --auto --{{MERGE_STRATEGY}} --delete-branch`. Polla a cada {{MERGE_POLL_INTERVAL}}s, máx {{MERGE_POLL_MAX}} tries.

## Falhou (em qualquer ponto)
[detalhes idênticos ao PROMPT.md atual]

## Restrições absolutas
- NUNCA `git push --force`, `--no-verify`, `--no-gpg-sign`.
- NUNCA push direto para `{{MAIN_BRANCH}}` ou `{{DEV_BRANCH}}` — sempre via PR.
- NUNCA tocar em: `.env*`, `.git/`, `node_modules/`, `dist/`, `logs/`, `ralph.config.sh`, `PROMPT.md`, `.ralph/`, `.claude/`, `ralph-notify.sh*`.
- NUNCA `rm -rf` em path absoluto.
- NUNCA editar arquivos fora de `{{PROJECT_ROOT}}`.
- NUNCA rodar comandos Bash que toquem arquivos fora de `{{PROJECT_ROOT}}`.
- NUNCA `gh pr merge` sem `--auto`. NUNCA `gh issue close` manual.

---

# Adendo deste projeto

{{PROJECT_PROMPT}}
```

### 3.4 — `PROMPT.md` (template do adendo, copiado pro projeto)

```md
# Adendo deste projeto

<!-- Injetado no final do prompt-base do Ralph.
     Coloque aqui APENAS o que é específico deste projeto.
     A sequência obrigatória e restrições vêm do pacote @lucasfe/ralph
     e atualizam automaticamente. -->

## Stack
<!-- ex: React 19 + Vite + Tailwind, JS puro -->

## MCPs disponíveis
<!-- ex: mcp__supabase__* — use quando issue envolver banco -->

## Sub-agentes
<!-- ex: /project:frontend, /project:backend, /project:qa, /project:docs -->

## Restrições extras
<!-- ex: NUNCA editar src/data/agents.json sem rodar a validação X -->
```

### 3.5 — `validate-config.md` (one-shot)

```md
# Validação de config Ralph

Você está validando o `ralph.config.sh` deste projeto pela primeira vez (ou após mudança).

1. Leia `ralph.config.sh`. Note os valores atuais de `INSTALL_CMD`, `TEST_CMD`, `LINT_CMD`, `MAIN_BRANCH`, `DEV_BRANCH`.
2. Inspecione manifests do projeto (package.json, pyproject.toml, go.mod, Cargo.toml, etc.).
3. Para cada comando:
   - **INSTALL_CMD**: tente rodar; se falhar, descubra o correto e atualize.
   - **TEST_CMD**: se vazio, detecte e preencha. Se inválido, corrija. Se projeto não tem testes, deixe vazio.
   - **LINT_CMD**: idem. Se sem lint, deixe vazio (não invente).
   - **MAIN_BRANCH/DEV_BRANCH**: confira via `git branch -a`. Se DEV_BRANCH não existe remotamente, iguale a MAIN_BRANCH (single-branch mode).
4. Se ajustar `ralph.config.sh`, comente as linhas alteradas com `# auto-ajustado em <data>`.
5. Grave `.ralph/state.json` com:
   ```json
   {
     "config_hash": "<sha256 do ralph.config.sh atualizado>",
     "validated_at": "<ISO8601 agora>",
     "ralph_version": "<vinda de $RALPH_VERSION env>",
     "detected_stack": "<node|python|go|rust|ruby|php|unknown>",
     "notes": "<o que ajustou e por quê, 1 linha>",
     "last_seen_release": "<mesma versão>"
   }
   ```
6. Imprima resumo curto. Termine.
```

### 3.6 — `slash-command.md` (template, vai para `.claude/commands/ralph.md`)

```md
# /ralph — Disparar Ralph loop

Dispara o Ralph loop: agente autônomo que resolve issues abertas do GitHub uma a uma, em background.

## O que fazer

Execute `ralph start` na raiz do projeto via Bash.

Se falhar com "command not found", instrua o usuário:
```bash
npm i -g @lucasfe/ralph
```

Reporte o output. Se pedir confirmação `[y/N]` para issues órfãs, repasse a pergunta.

## Comandos úteis

- `ralph doctor` — checa ambiente
- `tmux attach -t ralph` — vê ao vivo (Ctrl+B D pra detach)
- `tail -f logs/ralph-issue-*.log` — log da issue em curso
- `ralph stop` — mata sessão tmux

## Quando NÃO usar

- Já existe sessão `ralph` rodando (`tmux ls` mostra)
- Não há issues abertas elegíveis
- Sem `.env.local` *e* sem `ralph-notify.sh` — funciona, mas só verá resultado no tmux/log

## Documentação

`ralph --help` ou https://github.com/lucasfe/agenthub/tree/main/packages/ralph
```

### 3.7 — `ralph-notify.sh.example`

```sh
#!/bin/bash
# Hook custom de notificação. Renomeie para ralph-notify.sh e dê chmod +x.
# Args: $1=msg, $2=status (success|partial|failed), $3=ok_count, $4=fail_count, $5=duration_min

msg="$1"; status="$2"

# --- Slack ---
# curl -s -X POST -H 'Content-type: application/json' \
#   --data "{\"text\":\"$msg\"}" "$SLACK_WEBHOOK_URL"

# --- Discord ---
# curl -s -X POST -H 'Content-Type: application/json' \
#   --data "{\"content\":\"$msg\"}" "$DISCORD_WEBHOOK_URL"

# --- macOS native ---
# osascript -e "display notification \"$msg\" with title \"Ralph\""

# --- Email (sendmail) ---
# echo -e "Subject: Ralph $status\n\n$msg" | sendmail "$NOTIFY_EMAIL"
```

### 3.8 — `env.local.example`

```sh
# WhatsApp via CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/)
# Mensagem o bot 'CallMeBot' no WhatsApp com "I allow callmebot to send me messages"
# para receber sua API key.
CALLMEBOT_KEY=
WHATSAPP_PHONE=
```

---

## 4. Ramos explicitamente fora de escopo da v0.1

- `ralph upgrade` (diff de templates entre versões instaladas)
- `ralph status` / `ralph logs` (substituídos por `tmux attach` / `tail`)
- `RALPH_VERSION` pin via npx
- `AUTO_MERGE="false"` mode com label `claude-pr-open`
- Presets (`--preset react`, `--preset python-cli`)
- Plugin system de notificadores (sub-pacotes npm)
- Suporte a Windows nativo (PowerShell)
- Auto-instalação de deps via `brew`/`apt`
- Sandbox via container/firejail
- E2E tests com Claude real em CI
- Bash tests via `bats`
- Migração para repo standalone `lucasfe/ralph`

Cada um desses tem decisão registrada (rejeitada para v0.1, viável para v0.2+).

---

## 5. Próximos passos

1. Ler este documento e converter em PRD/issues no GitHub via `/to-issues` ou `/to-prd`.
2. Cada uma das 9 etapas de D16 vira issue separada com critérios de aceite.
3. Issues vão pra fila do próprio Ralph processar — meta-uso (Ralph constrói Ralph).

---

**Status:** Plano travado. 17 decisões + 9 etapas + 8 schemas. Pronto para implementação.
