from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import List, Union
from functools import lru_cache

# Origins to always allow in dev so OPTIONS preflight works (localhost vs 127.0.0.1, various ports)
DEV_CORS_ORIGINS = [
    "http://localhost:80", "http://localhost:3000", "http://localhost:5173", "http://localhost:8000", "http://localhost:8080",
    "http://127.0.0.1:80", "http://127.0.0.1:3000", "http://127.0.0.1:5173", "http://127.0.0.1:8000", "http://127.0.0.1:8080",
]


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
    
    # CORS (include both localhost and 127.0.0.1 so preflight OPTIONS succeeds from either)
    cors_origins: Union[List[str], str] = [
        "http://localhost:3000", "http://localhost:8000", "http://localhost:5173",
        "http://127.0.0.1:3000", "http://127.0.0.1:8000", "http://127.0.0.1:5173",
    ]
    
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[List[str], str]) -> List[str]:
        """Parse CORS_ORIGINS de string separada por vírgula para lista."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def ensure_dev_cors_origins(self) -> "Settings":
        """In dev, always add localhost/127.0.0.1 origins so OPTIONS preflight never gets 400."""
        if self.app_env.lower() != "dev":
            return self
        origins = list(self.cors_origins)
        for o in DEV_CORS_ORIGINS:
            if o not in origins:
                origins.append(o)
        object.__setattr__(self, "cors_origins", origins)
        return self
    
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
