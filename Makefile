# import config.
# You can change the default config with `make cnf="config_special.env" build`
# cnf ?= config.env
# include $(cnf)
# export $(shell sed 's/=.*//' $(cnf))

# import deploy config
# You can change the default deploy config with `make cnf="deploy_special.env" release`
# dpl ?= deploy.env
# include $(dpl)
# export $(shell sed 's/=.*//' $(dpl))

# grep the version from the mix file
VERSION=$(shell ./version.sh)

# HELP
# This will output the help for each task
.PHONY: help

help: ## This help.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help

# DOCKER TASKS
setup:
	@echo "Creating application and setting up database ..."
	ifeq ($(OS),Windows_NT)     # is Windows_NT on XP, 2000, 7, Vista, 10...
		docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build \
		&& npm i --force --silent \
		&& yarn install --ignore-engines --silent \
		&& cd hasura && hasura metadata apply \
		&& hasura migrate apply --up all --all-databases
	else
		docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build \
		&& npm i --force --silent \
		&& yarn install --ignore-engines --silent \
		&& cd hasura && hasura metadata apply \
		&& hasura migrate apply --up all --all-databases \
		&& sudo chmod a+rwx .
	endif

run-dev:
	@echo "Starting development environment ..."
	docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d

run-prod: ## Run container in development mode
	@echo "Starting production environment ..."
	docker-compose -f docker-compose.yml -f docker-compose-prod.yml up -d

build-dev:
	@echo "Creating development environment ..."
	docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build

build-prod: ## Run container in development mode
	@echo "Creating production environment ..."
	docker-compose -f docker-compose.yml -f docker-compose-prod.yml up -d --build

rebuild: 
	@echo "Restarting environment ..."
	docker-compose down --remove-orphans \
	&& sleep 2 \
	&& docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build

restart: 
	@echo "Restarting environment ..."
	docker-compose restart

stop: ## Stop running containers
	@echo "Stopping containers ..."
	docker-compose stop

down: ## Stop and remove running containers
	@echo "Stopping and removing containers ..."
	docker-compose down

test: ## Stop and remove running containers
	@echo "Running all unit tests ..."
	yarn jest --passWithNoTests --silent

console:
	@echo "Starting hasura console..." 
	cd hasura && npx hasura-cli console --admin-secret "myadminsecretkey"

run-migrations:
	@echo "Running all database migrations..."
	cd hasura && hasura migrate apply --up all
	
squash-migrations:
	@echo "Squashing migrations..."
	cd hasura && npx hasura-cli migrate squash --admin-secret myadminsecretkey --name "$(name)" --from $(from) --database-name Hasura-test
