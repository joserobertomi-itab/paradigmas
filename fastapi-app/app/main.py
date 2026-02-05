import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.middleware.request_id import RequestIDMiddleware
from app.api import api_router

# Configura logging antes de criar a app
setup_logging()
logger = get_logger("app.main")

app = FastAPI(
    title=settings.app_name,
    description="FastAPI application for managing cities data with CSV import functionality",
    version="0.1.0",
    debug=settings.debug,
    tags_metadata=[
        {
            "name": "cities",
            "description": "Operations with cities. Import CSV files and query cities by country.",
        },
        {
            "name": "health",
            "description": "Health check endpoints.",
        },
    ],
)

# Middleware de Request ID (deve vir antes do CORS)
app.add_middleware(RequestIDMiddleware)

# Configuração CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

app.include_router(api_router)

logger.info(
    "Application started",
    extra={"environment": settings.app_env, "cors_origins": settings.cors_origins},
)


@app.get("/", tags=["health"])
async def root():
    """Root endpoint - Welcome message."""
    return {"message": "Welcome to FastAPI App"}


@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint.
    
    Returns the current status of the application and environment.
    """
    return {"status": "ok", "environment": settings.app_env}
