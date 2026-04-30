ROOT    := $(CURDIR)
PID_DIR := $(ROOT)/.pids

FRONTEND_PID  := $(PID_DIR)/frontend.pid
GAME_PID      := $(PID_DIR)/game-server.pid
LEADER_PID    := $(PID_DIR)/leaderboard-api.pid
AUTH_PID      := $(PID_DIR)/auth-service.pid
HISTORY_PID   := $(PID_DIR)/match-history-service.pid

FRONTEND_LOG  := $(PID_DIR)/frontend.log
GAME_LOG      := $(PID_DIR)/game-server.log
LEADER_LOG    := $(PID_DIR)/leaderboard-api.log
AUTH_LOG      := $(PID_DIR)/auth-service.log
HISTORY_LOG   := $(PID_DIR)/match-history-service.log

.PHONY: start stop restart install logs status observe observe-stop observe-logs test test-watch db-migrate docker-up docker-down docker-logs docker-build docker-rebuild

DATABASE_URL ?= postgres://magnet_vis:magnet_vis_password@127.0.0.1:55432/magnet_vis

start:
	@mkdir -p $(PID_DIR)
	@$(MAKE) --no-print-directory _start-service NAME="leaderboard-api"      DIR=$(ROOT)/leaderboard-api      PID=$(LEADER_PID)  LOG=$(LEADER_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="game-server"          DIR=$(ROOT)/game-server          PID=$(GAME_PID)    LOG=$(GAME_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="auth-service"         DIR=$(ROOT)/auth-service         PID=$(AUTH_PID)    LOG=$(AUTH_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="match-history-service" DIR=$(ROOT)/match-history-service PID=$(HISTORY_PID) LOG=$(HISTORY_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="frontend"             DIR=$(ROOT)/frontend             PID=$(FRONTEND_PID) LOG=$(FRONTEND_LOG)
	@echo ""
	@echo "All services started."
	@echo "  frontend              -> http://localhost:5173"
	@echo "  game-server           -> http://localhost:3001"
	@echo "  leaderboard-api       -> http://localhost:3002"
	@echo "  auth-service          -> http://localhost:3003"
	@echo "  match-history-service -> http://localhost:3004"
	@echo ""
	@echo "Logs: make logs    Stop: make stop"

stop:
	@$(MAKE) --no-print-directory _stop-service NAME="frontend"              PID=$(FRONTEND_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="game-server"           PID=$(GAME_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="leaderboard-api"       PID=$(LEADER_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="auth-service"          PID=$(AUTH_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="match-history-service" PID=$(HISTORY_PID)
	@echo "All services stopped."

restart: stop start

install:
	@echo "Installing dependencies..."
	cd $(ROOT)/migrations           && npm install
	cd $(ROOT)/frontend              && npm install
	cd $(ROOT)/game-server           && npm install
	cd $(ROOT)/leaderboard-api       && npm install
	cd $(ROOT)/auth-service          && npm install
	cd $(ROOT)/match-history-service && npm install
	@echo "Done."

test:
	@echo "Installing test dependencies..."
	@cd $(ROOT)/tests && npm install --silent
	@echo "Running API tests..."
	@cd $(ROOT)/tests && npm test

test-watch:
	@cd $(ROOT)/tests && npm install --silent && npm run test:watch

db-migrate:
	@echo "Applying database migrations..."
	@cd $(ROOT)/migrations && DATABASE_URL="$(DATABASE_URL)" npm run migrate

logs:
	@echo "=== leaderboard-api ===" && tail -n 20 $(LEADER_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== game-server ===" && tail -n 20 $(GAME_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== auth-service ===" && tail -n 20 $(AUTH_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== match-history-service ===" && tail -n 20 $(HISTORY_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== frontend ===" && tail -n 20 $(FRONTEND_LOG) 2>/dev/null || echo "(no log)"

status:
	@$(MAKE) --no-print-directory _status NAME="frontend"              PID=$(FRONTEND_PID)
	@$(MAKE) --no-print-directory _status NAME="game-server"           PID=$(GAME_PID)
	@$(MAKE) --no-print-directory _status NAME="leaderboard-api"       PID=$(LEADER_PID)
	@$(MAKE) --no-print-directory _status NAME="auth-service"          PID=$(AUTH_PID)
	@$(MAKE) --no-print-directory _status NAME="match-history-service" PID=$(HISTORY_PID)

# -- Observability stack (Prometheus + Grafana in Docker) ----------------------

OBSERVE_DIR := $(ROOT)/observability

observe:
	@echo "Starting observability stack (Prometheus + Grafana)..."
	@docker compose -f $(OBSERVE_DIR)/docker-compose.yml up -d
	@echo ""
	@echo "Observability stack started."
	@echo "  Prometheus -> http://localhost:9090"
	@echo "  Grafana    -> http://localhost:3000  (admin / magnet-admin)"
	@echo ""
	@echo "Stop: make observe-stop"

observe-stop:
	@echo "Stopping observability stack..."
	@docker compose -f $(OBSERVE_DIR)/docker-compose.yml down
	@echo "Observability stack stopped."

observe-logs:
	@docker compose -f $(OBSERVE_DIR)/docker-compose.yml logs --tail=50 --follow

# -- Docker (containerized) ---------------------------------------------------

docker-build:
	@echo "Building Docker images (parallel)..."
	@docker compose build --parallel
	@echo "Done. Run: make docker-up"

docker-up:
	@echo "Starting all services and Postgres in Docker..."
	@docker compose --env-file .env.local up -d
	@echo ""
	@echo "Docker services started."
	@echo "  postgres              -> localhost:55432"
	@echo "  frontend              -> http://localhost:5173"
	@echo "  game-server           -> http://localhost:3001"
	@echo "  leaderboard-api       -> http://localhost:3002"
	@echo "  auth-service          -> http://localhost:3003"
	@echo "  match-history-service -> http://localhost:3004"
	@echo ""
	@echo "Logs: make docker-logs    Stop: make docker-down"

docker-down:
	@echo "Stopping Docker services..."
	@docker compose down
	@echo "Docker services stopped."

docker-logs:
	@docker compose logs -f

docker-rebuild:
	@echo "Rebuilding and restarting Docker services and Postgres (parallel)..."
	@docker compose down
	@docker compose build --parallel
	@docker compose --env-file .env.local up -d
	@echo "Docker services rebuilt and started."

# -- Internal helpers ---------------------------------------------------------

_start-service:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "$(NAME) already running (pid $$(cat $(PID)))"; \
	else \
		cd $(DIR) && npm run dev > $(LOG) 2>&1 & echo $$! > $(PID); \
		echo "$(NAME) started (pid $$(cat $(PID)))"; \
	fi

_stop-service:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		pkill -P $$(cat $(PID)) 2>/dev/null; \
		kill $$(cat $(PID)) 2>/dev/null; \
		rm -f $(PID); \
		echo "$(NAME) stopped"; \
	else \
		rm -f $(PID) 2>/dev/null; echo "$(NAME) was not running"; \
	fi

_status:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "$(NAME)  running  (pid $$(cat $(PID)))"; \
	else \
		echo "$(NAME)  stopped"; \
	fi
