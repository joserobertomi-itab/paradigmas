from fastapi import APIRouter
from . import cities

api_router = APIRouter(
    prefix="/api/v1",
    tags=["api"],
    responses={404: {"description": "Not found"}},
)

# Include routers
api_router.include_router(cities.router)


@api_router.get("/health", tags=["health"])
async def health_check():
    """API health check endpoint."""
    return {"status": "ok"}
