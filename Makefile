PROJECT       := unranked
TAGLINE       := a real-life System
HELP_VARS      = PORT=$(PORT)  ARGS=$(ARGS)  DB_PATH=$(DB_PATH)  PNPM=$(PNPM)
HELP_EXAMPLE   = make simulate ARGS="--days 60"

# ─── Preamble ────────────────────────────────────────────────────────────────
# -e stops a recipe at the first failing command; -o pipefail stops a gate that
# pipes through a filter from reporting the filter's exit code instead of the
# command's — without it, a suite that fails into `tail` "passes".
SHELL         := /usr/bin/env bash
.SHELLFLAGS   := -eo pipefail -c
.DEFAULT_GOAL := help
MAKEFLAGS     += --no-print-directory

# ─── Colour ──────────────────────────────────────────────────────────────────
# MAKE_TERMOUT (GNU Make >= 4.1) is set only when stdout is a terminal, and is
# the only reliable test available here: `test -t 1` inside $(shell ...) always
# reports false, because make captures that command's stdout through a pipe.
# So `make help | less` and CI logs stay clean. NO_COLOR disables, FORCE_COLOR
# overrides both.
COLOR ?= $(if $(MAKE_TERMOUT),1,0)
ifdef NO_COLOR
  COLOR := 0
endif
ifdef FORCE_COLOR
  COLOR := 1
endif
ifeq ($(COLOR),1)
  # Real ESC bytes, so a plain `echo` renders them without needing -e.
  C_HEAD := $(shell printf '\033[1m')
  C_CMD  := $(shell printf '\033[36m')
  C_OK   := $(shell printf '\033[32m')
  C_WARN := $(shell printf '\033[33m')
  C_ERR  := $(shell printf '\033[31m')
  C_DIM  := $(shell printf '\033[2m')
  C_OFF  := $(shell printf '\033[0m')
endif

# Explains why a core verb does not apply here, then fails.
NA = @printf '  $(C_ERR)make $@$(C_OFF) does not apply to $(PROJECT).\n  $(C_DIM)%s$(C_OFF)\n\n' $(1) >&2; exit 2

# Width of the target-name column in help; widen it where names are long.
HELP_PAD ?= 18

# PROJECT, TAGLINE, HELP_VARS and HELP_EXAMPLE are interpolated into a
# single-quoted shell string below, so none of them may contain an apostrophe.
##@ General
.PHONY: help
help: ## List the available targets
	@printf '\n  $(C_HEAD)$(PROJECT)$(C_OFF) — $(TAGLINE)\n'
	@printf '  $(C_DIM)usage: make <target>$(C_OFF)\n'
	@awk 'BEGIN { FS = ":.*?## " } \
	  /^##@ / { printf "\n  $(C_HEAD)%s$(C_OFF)\n", substr($$0, 5); next } \
	  /^[a-zA-Z0-9_.-]+:.*?## / { printf "    $(C_CMD)%-$(HELP_PAD)s$(C_OFF) %s\n", $$1, $$2 }' \
	  $(MAKEFILE_LIST)
	@printf '\n  $(C_DIM)Variables:$(C_OFF) $(HELP_VARS)\n'
	@printf '  $(C_DIM)Example:$(C_OFF)   $(HELP_EXAMPLE)\n\n'

# ─── End of the shared block ─────────────────────────────────────────────────

##@ Setup
.PHONY: install
install: $(STAMP) ## Install dependencies (only when the manifests changed)

.PHONY: setup
setup: install env db-migrate db-seed ## First run: install, env, migrate, seed
	@printf "\n  ready. 'make dev' to start the System.\n"

.PHONY: reinstall
reinstall: ## Force a clean dependency install
	rm -rf node_modules
	$(PNPM) install
	@touch $(STAMP)

.PHONY: env
env: ## Create .env.local from the example, if it does not exist yet
	@if [ -f .env.local ]; then \
		echo ".env.local already exists — left alone."; \
	else \
		cp .env.example .env.local; \
		echo "Wrote .env.local. Set your name, time zone and reset hour."; \
	fi

##@ Development
.PHONY: dev
dev: $(STAMP) ## Run the dev server (PORT=3000)
	PORT=$(PORT) $(PNPM) dev

.PHONY: build
build: $(STAMP) ## Production build
	$(PNPM) build

.PHONY: run
run: $(STAMP) ## Serve the production build (PORT=3000)
	PORT=$(PORT) $(PNPM) start

##@ Gates
.PHONY: check
check: typecheck test boundaries ## Fast gate: types, tests, boundaries

.PHONY: verify
verify: check build ## Full gate: everything above, plus a production build
	@printf "\n  all gates passed\n"

.PHONY: fmt
fmt: ## Not applicable here
	$(call NA,'No formatter is configured. Add one to package.json first.')

# unranked — task runner
#
# `make` on its own lists everything. The two you actually need day to day are
# `make dev` and `make verify`.

# Each recipe line already runs in its own shell, so heavy steps never share a
# memory spike. -e stops a recipe at the first failing command and -o pipefail
# stops a filtered pipeline from reporting the filter's exit code instead of the
# command's — a gate that pipes through `tail` otherwise "passes" while failing.

PNPM ?= pnpm
PORT ?= 3000
# Extra arguments for the targets that take them: make simulate ARGS="--days 60"
ARGS ?=

DB_PATH ?= ./data/unranked.db
STAMP := node_modules/.install.stamp

##@ Setup

# A stamp file rather than node_modules itself: pnpm rewrites entries inside the
# directory constantly, so its mtime is not a reliable "up to date" signal.
$(STAMP): package.json pnpm-lock.yaml pnpm-workspace.yaml
	$(PNPM) install
	@touch $@

##@ Gates

typecheck: $(STAMP) ## Type-check without emitting
	$(PNPM) typecheck

test: $(STAMP) ## Run the test suite once
	$(PNPM) test

test-watch: $(STAMP) ## Run the tests in watch mode
	$(PNPM) test:watch

# Architecture is a rule the tests cannot state, so it gets its own gate: the
# rules engine must stay pure, and the two provider gateways must stay ignorant
# of storage. Both are easy to break with one convenient import.
boundaries: ## Check the layer boundaries hold
	@echo "domain/ must import nothing but itself..."
	@if grep -rnE "from '@/(db|ai|voice|ui|app|server)/|from '(react|next)" src/domain/; then \
		echo "  ✗ domain/ reached outside itself — the rules engine is no longer pure."; \
		exit 1; \
	fi
	@echo "  ✓ clean"
	@echo "ai/ and voice/ must not touch the database..."
	@if grep -rnE "from '@/db/" src/ai/ src/voice/; then \
		echo "  ✗ a provider gateway reached into storage."; \
		exit 1; \
	fi
	@echo "  ✓ clean"
	@echo "components must use theme tokens, never raw hex..."
	@# find, not a glob: bash without globstar makes src/app/**/*.tsx match only
	@# one level down, quietly skipping src/app/page.tsx and layout.tsx.
	@if find src/ui src/app -name '*.tsx' -print0 \
		| xargs -0 grep -nE "#[0-9a-fA-F]{3,8}\b"; then \
		echo "  ✗ a raw colour escaped into a component — the themes will drift."; \
		exit 1; \
	fi
	@echo "  ✓ clean"

##@ Database

db-generate: $(STAMP) ## Generate a migration from the schema
	$(PNPM) db:generate

db-migrate: $(STAMP) ## Apply migrations
	$(PNPM) db:migrate

db-seed: $(STAMP) ## Install the starter quest library
	$(PNPM) db:seed

db-console: ## Open sqlite3 against the database (read-write)
	@command -v sqlite3 >/dev/null || { echo "sqlite3 is not installed."; exit 1; }
	sqlite3 $(DB_PATH)

##@ Balance And Providers

simulate: $(STAMP) ## Drive N days through the engine: make simulate ARGS="--days 60"
	$(PNPM) simulate $(ARGS)

history: $(STAMP) ## Give the local hunter history for UI work: make history ARGS=10
	$(PNPM) dev:history $(ARGS)

provider: $(STAMP) ## Stream one System line through the configured provider
	$(PNPM) try:provider

##@ Design

DESIGN_SRC := $(wildcard design/*.dc.html) design/canvas.json

canvas: ## Re-seed the design canvas from design/*.dc.html
	@if [ -z "$(DESIGN_SKILL)" ]; then \
		echo "Set DESIGN_SKILL to the design skill's base directory, then re-run."; \
		echo "  make canvas DESIGN_SKILL=/path/to/skills/design"; \
		exit 1; \
	fi
	node "$(DESIGN_SKILL)/seed-canvas.mjs" \
		--template "$(DESIGN_SKILL)/payload.template.html" \
		--out unranked-system-screens.html \
		--title "unranked — System Screens" \
		$(foreach f,$(wildcard design/*.dc.html),--artboard $(f)) \
		--canvas design/canvas.json
	node "$(DESIGN_SKILL)/seed-canvas.mjs" --check unranked-system-screens.html

clean-sim: ## Remove simulation databases only
	rm -f data/sim.db data/sim.db-wal data/sim.db-shm
	@echo "Simulation databases removed."

# Guarded rather than convenient on purpose: this erases the real record —
# every level, every quest completed, every piece of evidence attached.
clean-db: ## DESTROYS your System record. Requires CONFIRM=yes
	@if [ "$(CONFIRM)" != "yes" ]; then \
		echo "This deletes $(DB_PATH) and everything under data/evidence/:"; \
		echo "  every level, every completed quest, every piece of evidence."; \
		echo ""; \
		echo "There is no undo. Re-run with: make clean-db CONFIRM=yes"; \
		exit 1; \
	fi
	rm -f $(DB_PATH) $(DB_PATH)-wal $(DB_PATH)-shm
	rm -rf data/evidence
	@echo "System record erased."

##@ Cleaning
.PHONY: clean
clean: ## Remove build output and test artefacts
	rm -rf .next out coverage test-results playwright-report
	@echo "Build output removed. Your database and evidence are untouched."

.PHONY: distclean
distclean: clean ## Remove build output and node_modules
	rm -rf node_modules
	@echo "Dependencies removed. 'make install' to restore."

# ─── Compatibility aliases ───────────────────────────────────────────────────
# Kept because the README still uses these names.
.PHONY: start
start: run
