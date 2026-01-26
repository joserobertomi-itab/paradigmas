from sqlmodel import SQLModel, Field, Index, Column
from sqlalchemy import BigInteger, String, Float
from typing import Optional


class City(SQLModel, table=True):
    """Modelo de cidade com dados do worldcities.csv"""
    
    __tablename__ = "cities"
    
    id: int = Field(
        sa_column=Column(BigInteger, primary_key=True, autoincrement=False),
        description="ID vindo do dataset (não autoincrement)"
    )
    city: str = Field(
        max_length=255,
        description="Nome da cidade"
    )
    city_ascii: str = Field(
        max_length=255,
        description="Nome da cidade em ASCII"
    )
    lat: float = Field(
        sa_column=Column(Float),
        description="Latitude"
    )
    lng: float = Field(
        sa_column=Column(Float),
        description="Longitude"
    )
    country: str = Field(
        max_length=255,
        description="Nome do país",
        index=True
    )
    iso2: str = Field(
        max_length=2,
        description="Código ISO 2 letras",
        index=True
    )
    iso3: str = Field(
        max_length=3,
        description="Código ISO 3 letras"
    )
    admin_name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Nome da região administrativa"
    )
    capital: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Tipo de capital (ex: 'primary', 'admin')"
    )
    population: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, index=True),
        description="População"
    )
    
    __table_args__ = (
        Index("idx_country_city_ascii", "country", "city_ascii"),
    )
