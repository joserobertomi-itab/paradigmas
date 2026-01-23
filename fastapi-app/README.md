# FastAPI App

FastAPI application with SQLModel, Alembic, and PostgreSQL.

## Requirements

- Python 3.12+
- PostgreSQL
- Docker and Docker Compose (optional)
- `jq` (opcional, para formatação JSON no script): `sudo apt-get install jq` ou `brew install jq`

## Quick Start - Development Import Script

Para um início rápido com dados de exemplo, use o script de desenvolvimento:

```bash
./scripts/dev_import.sh
```

Este script executa automaticamente:
1. ✅ Sobe os serviços com `docker-compose up -d`
2. ✅ Aguarda os serviços ficarem prontos
3. ✅ Executa as migrações (`alembic upgrade head`)
4. ✅ Importa o arquivo `data/worldcities.csv` (3 cidades do Japan)
5. ✅ Busca e exibe as cidades do Japan via GET `/cities?country=Japan`

**Arquivo de exemplo**: `data/worldcities.csv` contém 3 cidades do Japan (Tokyo, Osaka, Yokohama)

### Passo a Passo Manual

Se preferir executar manualmente:

1. **Subir os serviços**:
```bash
docker-compose up -d
```

2. **Aguardar serviços ficarem prontos** (alguns segundos):
```bash
docker-compose ps
```

3. **Executar migrações**:
```bash
docker-compose exec api alembic upgrade head
```

4. **Importar cidades de exemplo**:
```bash
curl -X POST "http://localhost:8000/api/v1/cities/import" \
  -F "file=@data/worldcities.csv"
```

5. **Buscar cidades do Japan**:
```bash
curl -X GET "http://localhost:8000/api/v1/cities?country=Japan"
```

## Installation

### Local Development

1. Create a virtual environment:
```bash
python3.12 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -e .
```

3. Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```

4. Update the `.env` file with your database credentials.

5. Run migrations:
```bash
alembic upgrade head
```

6. Start the application:
```bash
uvicorn app.main:app --reload
```

The application will be available at `http://localhost:8000`.

## Docker

### Running with Docker Compose

1. Make sure you have Docker and Docker Compose installed.

2. Start the services:
```bash
docker-compose up -d
```

This will start:
- PostgreSQL database on port 5432
- FastAPI application on port 8000
- PgWeb (PostgreSQL web interface) on port 8081

3. Run migrations:
```bash
docker-compose exec api alembic upgrade head
```

4. Access the application:
- API: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`
- Alternative API Documentation: `http://localhost:8000/redoc`
- PgWeb (PostgreSQL Web UI): `http://localhost:8081`

### Stopping Docker Services

```bash
docker-compose down
```

To remove volumes (database data):
```bash
docker-compose down -v
```

## Database Migrations

Alembic is configured to automatically read the database connection from your environment variables. It uses the same configuration as the application:

- If `DATABASE_URL` is set, it will be used directly
- Otherwise, it constructs the connection string from individual PostgreSQL components:
  - `POSTGRES_HOST`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_PORT`

The configuration is handled by `app.core.config.Settings`, which Alembic imports in `alembic/env.py`.

### Running Migrations in Docker

After starting the services with `docker-compose up -d`, run migrations inside the `api` container:

```bash
docker-compose exec api alembic upgrade head
```

To create a new migration:

```bash
docker-compose exec api alembic revision --autogenerate -m "Description of changes"
```

To rollback a migration:

```bash
docker-compose exec api alembic downgrade -1
```

To see migration history:

```bash
docker-compose exec api alembic history
```

To see current revision:

```bash
docker-compose exec api alembic current
```

### Running Migrations Locally (Optional)

If running the application locally (not in Docker):

1. Make sure your `.env` file is configured with the correct database connection.

2. Activate your virtual environment:
```bash
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Run migrations:
```bash
alembic upgrade head
```

4. Create a new migration:
```bash
alembic revision --autogenerate -m "Description of changes"
```

5. Rollback a migration:
```bash
alembic downgrade -1
```

## Project Structure

```
fastapi-app/
├── alembic/              # Alembic migration files
│   ├── versions/         # Migration versions
│   ├── env.py           # Alembic environment configuration
│   └── script.py.mako   # Migration template
├── app/
│   ├── api/             # API routes
│   │   ├── cities.py    # Cities endpoints (import, list)
│   │   └── __init__.py
│   ├── core/            # Settings and configuration
│   ├── db/              # Database connection and session
│   ├── models/          # SQLModel ORM models
│   ├── schemas/         # Pydantic schemas
│   └── main.py          # FastAPI application entrypoint
├── data/
│   └── worldcities.csv # Sample CSV file with 3 cities (Japan)
├── scripts/
│   └── dev_import.sh    # Development script for quick import
├── tests/               # Test files
├── .env.example         # Environment variables example
├── .gitignore          # Git ignore rules
├── Dockerfile          # Docker image definition
├── docker-compose.yml  # Docker Compose configuration
├── pyproject.toml      # Project dependencies and configuration
└── README.md           # This file
```

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

The project uses standard Python formatting. Consider using `black` or `ruff` for code formatting and linting.

## API Documentation

Once the application is running, interactive API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### API Endpoints

#### POST `/api/v1/cities/import`
Importa cidades de um arquivo CSV.

**Estratégia**: UPSERT - Se um ID já existir, os dados serão atualizados.

**Formato CSV esperado**:
```csv
"city","city_ascii","lat","lng","country","iso2","iso3","admin_name","capital","population","id"
```

**Exemplo**:
```bash
curl -X POST "http://localhost:8000/api/v1/cities/import" \
  -F "file=@data/worldcities.csv"
```

#### GET `/api/v1/cities`
Lista cidades com filtros opcionais.

**Parâmetros**:
- `country` (opcional): Filtrar por nome do país
- `limit` (opcional, padrão: 100): Número máximo de resultados
- `offset` (opcional, padrão: 0): Número de resultados para pular

**Exemplo**:
```bash
curl "http://localhost:8000/api/v1/cities?country=Japan"
```
