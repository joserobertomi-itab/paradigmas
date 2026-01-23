import logging
import sys
from app.core.config import settings


class RequestIDFilter(logging.Filter):
    """Filter para adicionar request_id aos logs."""
    
    def filter(self, record):
        # Adiciona request_id se não existir (para logs fora de requisições)
        if not hasattr(record, 'request_id'):
            record.request_id = 'N/A'
        return True


# Configuração de logging estruturado
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] - %(message)s"

# Nível de log baseado no ambiente
LOG_LEVEL = logging.DEBUG if settings.is_dev else logging.INFO


def setup_logging():
    """Configura logging estruturado para a aplicação."""
    
    # Cria handler com formatação
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    handler.addFilter(RequestIDFilter())
    
    # Configura root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(LOG_LEVEL)
    root_logger.handlers = [handler]
    
    # Configura logger da aplicação
    app_logger = logging.getLogger("app")
    app_logger.setLevel(LOG_LEVEL)
    
    # Configura uvicorn logger
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.setLevel(LOG_LEVEL)
    
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.setLevel(logging.INFO)
    
    # Reduz verbosidade do uvicorn em produção
    if not settings.is_dev:
        uvicorn_access.setLevel(logging.WARNING)
    
    return app_logger


def get_logger(name: str = "app") -> logging.Logger:
    """Retorna um logger configurado."""
    return logging.getLogger(name)
