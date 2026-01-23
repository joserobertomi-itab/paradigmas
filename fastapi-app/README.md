# FastAPI App

FastAPI application with SQLModel, Alembic, and PostgreSQL.

## Requirements

- Python 3.12+
- PostgreSQL
- Docker and Docker Compose (optional)

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

3. Run migrations:
```bash
docker-compose exec app alembic upgrade head
```

4. Access the application:
- API: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`
- Alternative API Documentation: `http://localhost:8000/redoc`

### Stopping Docker Services

```bash
docker-compose down
```

To remove volumes (database data):
```bash
docker-compose down -v
```

## Database Migrations

### Creating a Migration

```bash
alembic revision --autogenerate -m "Description of changes"
```

### Applying Migrations

```bash
alembic upgrade head
```

### Rolling Back Migrations

```bash
alembic downgrade -1
```

### Running Migrations in Docker

```bash
docker-compose exec app alembic upgrade head
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
│   ├── core/            # Settings and configuration
│   ├── db/              # Database connection and session
│   ├── models/          # SQLModel ORM models
│   ├── schemas/         # Pydantic schemas
│   └── main.py          # FastAPI application entrypoint
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
