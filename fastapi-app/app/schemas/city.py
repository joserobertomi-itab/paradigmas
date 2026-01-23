from pydantic import BaseModel, Field, field_validator
from typing import Optional
from decimal import Decimal


class CityBase(BaseModel):
    """Schema base para City"""
    city: str = Field(..., max_length=255, description="Nome da cidade")
    city_ascii: str = Field(..., max_length=255, description="Nome da cidade em ASCII")
    lat: Decimal = Field(..., description="Latitude")
    lng: Decimal = Field(..., description="Longitude")
    country: str = Field(..., max_length=255, description="Nome do país")
    iso2: str = Field(..., max_length=2, min_length=2, description="Código ISO 2 letras")
    iso3: str = Field(..., max_length=3, min_length=3, description="Código ISO 3 letras")
    admin_name: Optional[str] = Field(None, max_length=255, description="Nome da região administrativa")
    capital: Optional[str] = Field(None, max_length=50, description="Tipo de capital")
    population: Optional[int] = Field(None, description="População")
    
    @field_validator("iso2")
    @classmethod
    def validate_iso2(cls, v: str) -> str:
        """Valida que iso2 tem exatamente 2 caracteres."""
        if len(v) != 2:
            raise ValueError("iso2 deve ter exatamente 2 caracteres")
        return v.upper()
    
    @field_validator("iso3")
    @classmethod
    def validate_iso3(cls, v: str) -> str:
        """Valida que iso3 tem exatamente 3 caracteres."""
        if len(v) != 3:
            raise ValueError("iso3 deve ter exatamente 3 caracteres")
        return v.upper()


class CityCreate(CityBase):
    """Schema para criação de cidade"""
    id: int = Field(..., description="ID vindo do dataset")


class CityUpdate(BaseModel):
    """Schema para atualização parcial de cidade"""
    city: Optional[str] = Field(None, max_length=255)
    city_ascii: Optional[str] = Field(None, max_length=255)
    lat: Optional[Decimal] = None
    lng: Optional[Decimal] = None
    country: Optional[str] = Field(None, max_length=255)
    iso2: Optional[str] = Field(None, max_length=2, min_length=2)
    iso3: Optional[str] = Field(None, max_length=3, min_length=3)
    admin_name: Optional[str] = Field(None, max_length=255)
    capital: Optional[str] = Field(None, max_length=50)
    population: Optional[int] = None
    
    @field_validator("iso2")
    @classmethod
    def validate_iso2(cls, v: Optional[str]) -> Optional[str]:
        """Valida que iso2 tem exatamente 2 caracteres."""
        if v is not None and len(v) != 2:
            raise ValueError("iso2 deve ter exatamente 2 caracteres")
        return v.upper() if v else None
    
    @field_validator("iso3")
    @classmethod
    def validate_iso3(cls, v: Optional[str]) -> Optional[str]:
        """Valida que iso3 tem exatamente 3 caracteres."""
        if v is not None and len(v) != 3:
            raise ValueError("iso3 deve ter exatamente 3 caracteres")
        return v.upper() if v else None


class CityRead(CityBase):
    """Schema para leitura de cidade"""
    id: int = Field(..., description="ID da cidade")
    
    class Config:
        from_attributes = True
