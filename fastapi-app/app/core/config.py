from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "FastAPI App"
    app_env: str = "dev"
    
    # Database - pode usar DATABASE_URL completa ou componentes individuais
    database_url: str | None = None
    postgres_host: str = "localhost"
    postgres_db: str = "dbname"
    postgres_user: str = "user"
    postgres_password: str = "password"
    postgres_port: int = 5432
    
    # CORS
    cors_origins: Union[List[str], str] = ["http://localhost:3000", "http://localhost:8000", "http://localhost:5173"]
    
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[List[str], str]) -> List[str]:
        """Parse CORS_ORIGINS de string separada por vírgula para lista."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    # SQLAlchemy/SQLModel
    db_echo: bool = False
    db_pool_size: int = 5
    db_max_overflow: int = 10

    @property
    def database_url_computed(self) -> str:
        """Retorna DATABASE_URL se fornecida, ou constrói a partir dos componentes."""
        if self.database_url:
            # Se já usar postgresql://, substitui por postgresql+psycopg://
            if self.database_url.startswith("postgresql://"):
                return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
            # Se já usar postgresql+psycopg://, mantém
            if self.database_url.startswith("postgresql+psycopg://"):
                return self.database_url
            return self.database_url
        return f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    
    @property
    def is_dev(self) -> bool:
        """Verifica se está em ambiente de desenvolvimento."""
        return self.app_env.lower() == "dev"
    
    @property
    def debug(self) -> bool:
        """Retorna True se estiver em desenvolvimento."""
        return self.is_dev

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_nested_delimiter="__",
    )


@lru_cache()
def get_settings() -> Settings:
    """Retorna instância singleton das configurações."""
    return Settings()


settings = get_settings()
