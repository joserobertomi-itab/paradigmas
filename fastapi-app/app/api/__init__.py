from fastapi import APIRouter
from . import cities

api_router = APIRouter(prefix="/api/v1")

# Include routers
api_router.include_router(cities.router)


@api_router.get("/health")
async def health_check():
    return {"status": "ok"}
