PORT ?= 3010
PID_FILE := .drive-swing.pid
LOG_FILE := drive-swing.log

.DEFAULT_GOAL := help

.PHONY: help install setup bootstrap seed reset reseed fresh start stop restart status dev

help: ## List all make targets
	@echo "Drive Swing — available commands:"
	@echo ""
	@echo "  Setup"
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "    %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST) | grep -E 'install|setup|bootstrap' | sort
	@echo ""
	@echo "  Data"
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "    %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST) | grep -E 'seed|reset|reseed|fresh' | sort
	@echo ""
	@echo "  Server"
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "    %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST) | grep -E 'start|stop|restart|status|dev' | sort
	@echo ""
	@echo "Variables: PORT (default $(PORT))"
	@echo ""
	@echo "Quick start:  make bootstrap && make dev"
	@echo "Reset data:   make reset   (same as make reseed)"

install: ## Install npm dependencies
	npm install

setup: ## Copy .env.example to .env and install dependencies
	@test -f .env || cp .env.example .env
	npm install
	@echo "Setup complete. Edit .env if needed, then: make seed && make dev"

bootstrap: setup seed ## First-time setup: .env, deps, and sample data
	@echo "Bootstrap complete. Run: make dev"

seed: ## Load (or overwrite with) sample bays, players, and bookings
	node scripts/seed.js

reset: ## Wipe all data and reload sample seed
	node scripts/reset.js

reseed: ## Wipe all data and reload sample seed (alias for reset)
	@$(MAKE) reset

fresh: ## Wipe all data and reload sample seed (alias for reset)
	@$(MAKE) reset

start: ## Start the server in the background (nohup)
	@port_pid=$$(lsof -ti :$(PORT) 2>/dev/null); \
	if [ -n "$$port_pid" ] && [ -f $(PID_FILE) ] && [ "$$port_pid" = "$$(cat $(PID_FILE))" ]; then \
		echo "Already running at http://localhost:$(PORT) (PID $$port_pid)"; \
		exit 0; \
	fi; \
	if [ -n "$$port_pid" ]; then \
		echo "Port $(PORT) is in use by PID $$port_pid (another app?)."; \
		echo "Stop it first, or run: PORT=3011 make start"; \
		exit 1; \
	fi
	@PORT=$(PORT) nohup node src/index.js >> $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE)
	@sleep 0.5
	@if lsof -ti :$(PORT) >/dev/null 2>&1; then \
		echo "Started at http://localhost:$(PORT) (PID $$(cat $(PID_FILE)))"; \
	else \
		echo "Failed to start — check $(LOG_FILE):"; \
		tail -5 $(LOG_FILE) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
		exit 1; \
	fi

stop: ## Stop the background server
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
	fi
	@pid=$$(lsof -ti :$(PORT) 2>/dev/null); \
	if [ -n "$$pid" ]; then \
		kill $$pid 2>/dev/null || true; \
		echo "Stopped process on port $(PORT) (PID $$pid)"; \
	else \
		echo "Not running on port $(PORT)"; \
	fi

restart: stop start ## Restart the background server

status: ## Show whether the server is running
	@pid=$$(lsof -ti :$(PORT) 2>/dev/null); \
	if [ -n "$$pid" ]; then \
		echo "Running at http://localhost:$(PORT) (PID $$pid)"; \
	else \
		echo "Not running on port $(PORT)"; \
	fi

dev: ## Run in the foreground with file watch (Ctrl+C to stop)
	PORT=$(PORT) node --watch src/index.js
