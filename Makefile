# Makefile for Paradigmas de Programação project
# Manages both FastAPI backend and GeoDB K-means frontend

.PHONY: up down logs migrate migrate-seed clean help build

# Default target
.DEFAULT_GOAL := help


## build: Build all services
build:
	docker compose build

## up: Start all services in detached mode
up:
	docker compose up -d

## down: Stop and remove all services
down:
	docker compose down

## logs: Follow logs from all services
logs:
	docker compose logs -f

## migrate: Apply database migrations
migrate:
	@echo "Waiting for database to be ready..."
	@docker compose up -d db
	@sleep 5
	docker compose exec api alembic upgrade head

## migrate-seed: Apply migrations and import cities data from CSV
migrate-seed:
	@echo "Waiting for database to be ready..."
	@docker compose up -d db api
	@sleep 5
	@echo "Applying migrations..."
	docker compose exec api alembic upgrade head
	@echo "Importing cities data..."
	curl -X POST "http://localhost:8000/api/v1/cities/import" \
		-F "file=@fastapi-app/data/worldcities.csv"
	@echo "\nData import complete!"

## clean: Stop services and remove containers, volumes, and images
clean:
	docker compose down -v --rmi local --remove-orphans

## help: Show this help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
