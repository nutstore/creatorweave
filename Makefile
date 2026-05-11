.PHONY: help install dev build test clean lint format hooks

# Default target
.DEFAULT_GOAL := help

# Color definitions
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show help message
	@echo '$(BLUE)CreatorWeave - Commands$(NC)'
	@echo ''
	@echo '$(GREEN)Quick Start:$(NC)'
	@echo '  make setup         - First-time setup (install all dependencies)'
	@echo '  make setup-hooks   - Install git pre-commit hooks'
	@echo '  make dev           - Start development server'
	@echo '  make build         - Build all projects (WASM + frontend)'
	@echo '  make test          - Run all tests'
	@echo '  make clean         - Clean build artifacts'
	@echo ''
	@echo '$(GREEN)Code Quality:$(NC)'
	@echo '  make lint          - Run ESLint and Clippy checks'
	@echo '  make lint-fix      - Fix linting issues automatically'
	@echo '  make format        - Format all code (Rust + TypeScript)'
	@echo '  make typecheck     - Run TypeScript type check'
	@echo ''
	@echo '$(GREEN)Individual Commands:$(NC)'
	@echo '  make install-deps  - Install pnpm dependencies only'
	@echo '  make build-wasm    - Build WASM module'
	@echo '  make build-web     - Build frontend'
	@echo '  make test-rust     - Run Rust tests'
	@echo '  make test-web      - Run frontend tests'
	@echo '  make fmt           - Format Rust code'
	@echo '  make clippy        - Run Clippy checks'

setup: ## First-time setup (install all dependencies)
	@bash scripts/setup.sh

setup-hooks: ## Install git pre-commit hooks
	@bash scripts/setup-hooks.sh

install: install-deps ## Alias for install-deps

install-deps: ## Install pnpm dependencies
	@echo '$(BLUE)Installing dependencies...$(NC)'
	@cd web && pnpm install
	@cd browser-extension && pnpm install
	@echo '$(GREEN)✅ Dependencies installed!$(NC)'

dev: ## Start development server
	@bash scripts/dev.sh

build: ## Build all projects (WASM + frontend)
	@bash scripts/build.sh

build-wasm: ## Build WASM module only
	@echo '$(BLUE)Building WASM module...$(NC)'
	@cd wasm && bash scripts/build-wasm.sh
	@echo '$(GREEN)✅ WASM module built!$(NC)'

build-web: ## Build frontend only
	@echo '$(BLUE)Building frontend...$(NC)'
	@cd web && pnpm run build
	@echo '$(GREEN)✅ Frontend built!$(NC)'

build-extension: ## Build browser extension only
	@echo '$(BLUE)Building browser extension...$(NC)'
	@cd browser-extension && ([ -d node_modules ] || pnpm install) && pnpm run build
	@echo '$(GREEN)✅ Browser extension built!$(NC)'

test: ## Run all tests
	@bash scripts/test.sh

test-rust: ## Run Rust tests
	@echo '$(BLUE)Running Rust tests...$(NC)'
	@cd wasm/crates/core && cargo test
	@echo '$(GREEN)✅ Rust tests passed!$(NC)'

test-web: ## Run frontend tests
	@echo '$(BLUE)Running frontend tests...$(NC)'
	@cd web && pnpm test
	@echo '$(GREEN)✅ Frontend tests passed!$(NC)'

lint: ## Run all linters (ESLint + Clippy)
	@echo '$(BLUE)Running linters...$(NC)'
	@$(MAKE) lint-rust
	@$(MAKE) lint-web
	@echo '$(GREEN)✅ All lint checks passed!$(NC)'

lint-fix: ## Fix linting issues automatically
	@echo '$(BLUE)Fixing linting issues...$(NC)'
	@$(MAKE) lint-rust-fix
	@$(MAKE) lint-web-fix
	@echo '$(GREEN)✅ Linting issues fixed!$(NC)'

lint-rust: ## Run Rust linter (Clippy)
	@echo '$(BLUE)Running Clippy...$(NC)'
	@cd wasm && cargo clippy -- -D warnings
	@echo '$(GREEN)✅ Clippy checks passed!$(NC)'

lint-rust-fix: ## Fix Rust linting issues
	@echo '$(BLUE)Fixing Clippy issues...$(NC)'
	@cd wasm && cargo clippy --fix --allow-dirty --allow-staged
	@echo '$(GREEN)✅ Clippy issues fixed!$(NC)'

lint-web: ## Run frontend linter (ESLint)
	@echo '$(BLUE)Running ESLint...$(NC)'
	@cd web && pnpm run lint
	@echo '$(GREEN)✅ ESLint checks passed!$(NC)'

lint-web-fix: ## Fix frontend linting issues
	@echo '$(BLUE)Fixing ESLint issues...$(NC)'
	@cd web && pnpm run lint:fix
	@echo '$(GREEN)✅ ESLint issues fixed!$(NC)'

format: ## Format all code (Rust + TypeScript + CSS)
	@echo '$(BLUE)Formatting code...$(NC)'
	@$(MAKE) fmt
	@$(MAKE) fmt-web
	@echo '$(GREEN)✅ All code formatted!$(NC)'

fmt: ## Format Rust code
	@echo '$(BLUE)Formatting Rust code...$(NC)'
	@cd wasm && cargo fmt
	@echo '$(GREEN)✅ Rust code formatted!$(NC)'

fmt-web: ## Format frontend code
	@echo '$(BLUE)Formatting frontend code...$(NC)'
	@cd web && pnpm run format
	@echo '$(GREEN)✅ Frontend code formatted!$(NC)'

typecheck: ## Run TypeScript type check
	@echo '$(BLUE)Running TypeScript type check...$(NC)'
	@cd web && pnpm run typecheck
	@echo '$(GREEN)✅ Type check passed!$(NC)'

clean: ## Clean build artifacts
	@bash scripts/clean.sh

hooks: ## Alias for setup-hooks
	@$(MAKE) setup-hooks

clippy: ## Alias for lint-rust
	@$(MAKE) lint-rust
