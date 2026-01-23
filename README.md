# Paradigmas de Programação - Unified Application

This repository contains two applications that can be run together using Docker Compose:

- **FastAPI Backend** (`fastapi-app/`) - REST API for city data management
- **Frontend Web App** (`geodb-kmeans/`) - K-means clustering visualization

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Environment variables configured

### Setup

1. **Configure environment variables:**

   ```bash
   # Copy example files
   cp .env.example .env
   cp fastapi-app/.env.example fastapi-app/.env
   cp geodb-kmeans/.envexample geodb-kmeans/.env
   ```

2. **Edit the `.env` files with your configuration:**
   - Root `.env`: Set `VITE_RAPIDAPI_KEY` for the frontend
   - `fastapi-app/.env`: Set database credentials
   - `geodb-kmeans/.env`: Set RapidAPI key (optional, can use root .env)

3. **Start all services:**

   **Option 1: Using the startup script (recommended):**
   ```bash
   ./start.sh
   ```

   Or in detached mode:
   ```bash
   ./start.sh -d
   ```

   **Option 2: Using docker-compose directly:**
   ```bash
   docker-compose up --build
   ```

   Or run in detached mode:
   ```bash
   docker-compose up -d --build
   ```

### Services

Once started, the following services will be available:

- **Frontend**: http://localhost:5173
- **FastAPI Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **pgWeb (Database UI)**: http://localhost:8081

### Individual Services

You can also run services individually:

```bash
# Run only FastAPI services
cd fastapi-app
docker-compose up

# Run only frontend
cd geodb-kmeans
docker-compose up
```

## 📁 Project Structure

```
paradigmas/
├── docker-compose.yml              # Unified compose file (root)
├── docker-compose.override.yml     # Optional overrides (create from .example)
├── .env                            # Root environment variables
├── fastapi-app/                    # Backend application
│   ├── docker-compose.yml          # Standalone compose file
│   ├── Dockerfile
│   └── .env                        # Backend environment variables
└── geodb-kmeans/                   # Frontend application
    ├── docker-compose.yml          # Standalone compose file
    ├── Dockerfile
    └── .env                        # Frontend environment variables
```

## 🔧 Development

### Using Override Files

Create `docker-compose.override.yml` to customize development settings:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

Override files are automatically loaded by docker-compose and allow you to:
- Modify volumes for hot-reload
- Change ports
- Add development tools
- Override commands

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes database data)
docker-compose down -v
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f db
```

## 📚 Documentation

- [FastAPI App README](fastapi-app/README.md)
- [GeoDB K-means README](geodb-kmeans/README.md)

## 🐛 Troubleshooting

### Port Conflicts

If ports are already in use, modify the port mappings in `docker-compose.yml`:

```yaml
ports:
  - "8001:8000"  # Change host port
```

### Environment Variables

Make sure all `.env` files are properly configured. Check:

```bash
# Verify environment variables are loaded
docker-compose config
```

### Database Connection Issues

Ensure the database is healthy before the API starts:

```bash
# Check database health
docker-compose ps db
docker-compose logs db
```

## 📝 Notes

- The unified `docker-compose.yml` uses a shared network (`paradigmas-network`) for service communication
- Services can reference each other by service name (e.g., `db` for database)
- Individual `docker-compose.yml` files in subdirectories can still be used for standalone development
