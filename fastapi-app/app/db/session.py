from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

# Configura o echo baseado no ambiente (dev = True)
echo_sql = settings.is_dev and settings.db_echo

engine = create_engine(
    settings.database_url_computed,
    echo=echo_sql,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)


def get_session():
    """Dependency do FastAPI para obter sessão do banco de dados."""
    with Session(engine) as session:
        yield session


def init_db():
    """Inicializa o banco de dados criando todas as tabelas."""
    SQLModel.metadata.create_all(engine)
