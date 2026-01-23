import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import logging
from contextvars import ContextVar

# Context variable para armazenar request_id
request_id_context: ContextVar[str] = ContextVar('request_id', default='N/A')

logger = logging.getLogger("app.middleware")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware para adicionar X-Request-Id em todas as requisições."""
    
    async def dispatch(self, request: Request, call_next):
        # Verifica se já existe X-Request-Id no header
        request_id = request.headers.get("X-Request-Id")
        
        if not request_id:
            # Gera um novo UUID se não existir
            request_id = str(uuid.uuid4())
        
        # Adiciona request_id ao state da requisição
        request.state.request_id = request_id
        
        # Define request_id no context variable
        token = request_id_context.set(request_id)
        
        try:
            # Adiciona filtro de logging com request_id
            old_factory = logging.getLogRecordFactory()
            
            def record_factory(*args, **kwargs):
                record = old_factory(*args, **kwargs)
                record.request_id = request_id_context.get()
                return record
            
            logging.setLogRecordFactory(record_factory)
            
            # Processa a requisição
            response: Response = await call_next(request)
            
            # Adiciona X-Request-Id no header da resposta
            response.headers["X-Request-Id"] = request_id
            
            return response
        finally:
            # Restaura factory original e limpa context
            logging.setLogRecordFactory(old_factory)
            request_id_context.reset(token)
