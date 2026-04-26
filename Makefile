ROOT    := $(CURDIR)
PID_DIR := $(ROOT)/.pids

FRONTEND_PID  := $(PID_DIR)/frontend.pid
GAME_PID      := $(PID_DIR)/game-server.pid
LEADER_PID    := $(PID_DIR)/leaderboard-api.pid

FRONTEND_LOG  := $(PID_DIR)/frontend.log
GAME_LOG      := $(PID_DIR)/game-server.log
LEADER_LOG    := $(PID_DIR)/leaderboard-api.log

.PHONY: dev stop restart install logs status

start:
	@mkdir -p $(PID_DIR)
	@$(MAKE) --no-print-directory _start-service NAME="leaderboard-api" DIR=$(ROOT)/leaderboard-api PID=$(LEADER_PID)   LOG=$(LEADER_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="game-server"     DIR=$(ROOT)/game-server     PID=$(GAME_PID)     LOG=$(GAME_LOG)
	@$(MAKE) --no-print-directory _start-service NAME="frontend"        DIR=$(ROOT)/frontend        PID=$(FRONTEND_PID) LOG=$(FRONTEND_LOG)
	@echo ""
	@echo "All services started."
	@echo "  frontend      -> http://localhost:5173"
	@echo "  game-server   -> http://localhost:3001"
	@echo "  leaderboard   -> http://localhost:3002"
	@echo ""
	@echo "Logs: make logs    Stop: make stop"

stop:
	@$(MAKE) --no-print-directory _stop-service NAME="frontend"        PID=$(FRONTEND_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="game-server"     PID=$(GAME_PID)
	@$(MAKE) --no-print-directory _stop-service NAME="leaderboard-api" PID=$(LEADER_PID)
	@echo "All services stopped."

restart: stop start

install:
	@echo "Installing dependencies..."
	cd $(ROOT)/frontend        && npm install
	cd $(ROOT)/game-server     && npm install
	cd $(ROOT)/leaderboard-api && npm install
	@echo "Done."

logs:
	@echo "=== leaderboard-api ===" && tail -n 20 $(LEADER_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== game-server ===" && tail -n 20 $(GAME_LOG) 2>/dev/null || echo "(no log)"
	@echo "=== frontend ===" && tail -n 20 $(FRONTEND_LOG) 2>/dev/null || echo "(no log)"

status:
	@$(MAKE) --no-print-directory _status NAME="frontend"        PID=$(FRONTEND_PID)
	@$(MAKE) --no-print-directory _status NAME="game-server"     PID=$(GAME_PID)
	@$(MAKE) --no-print-directory _status NAME="leaderboard-api" PID=$(LEADER_PID)

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
		kill $$(cat $(PID)) && rm -f $(PID) && echo "$(NAME) stopped"; \
	else \
		rm -f $(PID) 2>/dev/null; echo "$(NAME) was not running"; \
	fi

_status:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "$(NAME)  running  (pid $$(cat $(PID)))"; \
	else \
		echo "$(NAME)  stopped"; \
	fi
