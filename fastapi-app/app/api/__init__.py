from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health")
async def health_check():
    return {"status": "ok"}
