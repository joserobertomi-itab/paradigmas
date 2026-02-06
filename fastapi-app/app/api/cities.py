import csv
import io
import math
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from pydantic import BaseModel, Field

from app.db.session import get_session
from app.models.city import City
from app.schemas.city import CityRead

router = APIRouter(prefix="/cities", tags=["cities"])

BATCH_SIZE = 5000
MAX_ERROR_EXAMPLES = 10

# Earth's radius in kilometers
EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth using the Haversine formula.
    
    This function handles negative latitude and longitude values correctly:
    - Negative latitude: South of the equator
    - Negative longitude: West of the prime meridian
    
    Args:
        lat1: Latitude of first point in degrees (can be negative)
        lng1: Longitude of first point in degrees (can be negative)
        lat2: Latitude of second point in degrees (can be negative)
        lng2: Longitude of second point in degrees (can be negative)
    
    Returns:
        Distance in kilometers
    """
    # Convert degrees to radians
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    
    # Haversine formula
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return EARTH_RADIUS_KM * c


def parse_csv_row(row: List[str], line_number: int) -> Dict[str, Any] | None:
    """
    Parse uma linha do CSV e retorna um dicionário com os dados da cidade.
    Retorna None se houver erro de parsing.
    """
    try:
        if len(row) != 11:
            return {"error": f"Linha {line_number}: Esperado 11 colunas, encontrado {len(row)}"}
        
        # Remove aspas e espaços em branco
        clean_row = [field.strip().strip('"') for field in row]
        
        # Parse e validação de tipos
        try:
            city_id = int(clean_row[10])  # id
        except (ValueError, IndexError):
            return {"error": f"Linha {line_number}: ID inválido: {clean_row[10] if len(clean_row) > 10 else 'N/A'}"}
        
        try:
            lat = float(clean_row[2])  # lat
        except (ValueError, IndexError):
            return {"error": f"Linha {line_number}: Latitude inválida: {clean_row[2] if len(clean_row) > 2 else 'N/A'}"}
        
        try:
            lng = float(clean_row[3])  # lng
        except (ValueError, IndexError):
            return {"error": f"Linha {line_number}: Longitude inválida: {clean_row[3] if len(clean_row) > 3 else 'N/A'}"}
        
        # Population pode ser vazio/null
        population = None
        if clean_row[9] and clean_row[9].strip():
            try:
                population = int(clean_row[9])
            except (ValueError, IndexError):
                # Se não conseguir converter, deixa como None
                pass
        
        return {
            "id": city_id,
            "city": clean_row[0],
            "city_ascii": clean_row[1],
            "lat": lat,
            "lng": lng,
            "country": clean_row[4],
            "iso2": clean_row[5].upper() if clean_row[5] else None,
            "iso3": clean_row[6].upper() if clean_row[6] else None,
            "admin_name": clean_row[7] if clean_row[7] else None,
            "capital": clean_row[8] if clean_row[8] else None,
            "population": population,
        }
    except Exception as e:
        return {"error": f"Linha {line_number}: Erro inesperado: {str(e)}"}


def upsert_cities_batch(session: Session, cities: List[Dict[str, Any]]) -> tuple[int, int]:
    """
    Faz upsert de um lote de cidades usando PostgreSQL ON CONFLICT.
    Retorna (inserted_count, updated_count).
    
    Estratégia: UPSERT - Se o ID já existir, atualiza os campos.
    """
    if not cities:
        return 0, 0
    
    # Verifica quais IDs já existem antes do upsert
    city_ids = [c["id"] for c in cities]
    existing_ids = set(session.exec(select(City.id).where(City.id.in_(city_ids))).all())
    
    # Prepara os dados para inserção
    values = []
    for city in cities:
        values.append({
            "id": city["id"],
            "city": city["city"][:255],  # Garante max_length
            "city_ascii": city["city_ascii"][:255],
            "lat": float(city["lat"]),
            "lng": float(city["lng"]),
            "country": city["country"][:255],
            "iso2": city["iso2"][:2] if city["iso2"] else None,
            "iso3": city["iso3"][:3] if city["iso3"] else None,
            "admin_name": city["admin_name"][:255] if city["admin_name"] else None,
            "capital": city["capital"][:50] if city["capital"] else None,
            "population": city["population"],
        })
    
    # Usa PostgreSQL ON CONFLICT para fazer upsert
    stmt = pg_insert(City.__table__).values(values)
    
    # ON CONFLICT UPDATE - atualiza todos os campos exceto o id
    # Usa excluded para referenciar os valores que estariam sendo inseridos
    update_dict = {
        "city": stmt.excluded.city,
        "city_ascii": stmt.excluded.city_ascii,
        "lat": stmt.excluded.lat,
        "lng": stmt.excluded.lng,
        "country": stmt.excluded.country,
        "iso2": stmt.excluded.iso2,
        "iso3": stmt.excluded.iso3,
        "admin_name": stmt.excluded.admin_name,
        "capital": stmt.excluded.capital,
        "population": stmt.excluded.population,
    }
    
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_=update_dict
    )
    
    session.execute(stmt)
    session.commit()
    
    # Calcula inserted e updated baseado nos IDs que existiam antes
    inserted = len([c for c in cities if c["id"] not in existing_ids])
    updated = len([c for c in cities if c["id"] in existing_ids])
    
    return inserted, updated


@router.post(
    "/import",
    summary="Import cities from CSV",
    description="Import cities from a CSV file with upsert strategy (updates if ID exists)",
    response_description="Import statistics with inserted, updated, skipped counts and error examples",
    tags=["cities"]
)
async def import_cities(
    file: UploadFile = File(..., description="CSV file with cities data"),
    session: Session = Depends(get_session)
):
    """
    Importa cidades de um arquivo CSV.
    
    **Estratégia de Upsert**: Se um ID já existir, os dados serão atualizados.
    
    **Formato CSV esperado** (com header):
    "city","city_ascii","lat","lng","country","iso2","iso3","admin_name","capital","population","id"
    
    **Processamento**:
    - Processa em batches de 5.000 linhas
    - Não carrega o arquivo inteiro em memória
    - Commits em transações por batch
    
    **Retorno**:
    - inserted: número de cidades inseridas
    - updated: número de cidades atualizadas (upsert)
    - skipped: número de linhas ignoradas (erros de parsing)
    - errors: lista de até 10 exemplos de erros
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV")
    
    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    errors: List[str] = []
    current_batch: List[Dict[str, Any]] = []
    line_number = 0
    
    try:
        # Lê o arquivo em modo streaming para não carregar tudo em memória
        # Decodifica UTF-8 em chunks
        content_bytes = await file.read()
        file_stream = io.StringIO(content_bytes.decode('utf-8'))
        csv_reader = csv.reader(file_stream, quotechar='"', delimiter=',')
        
        # Pula o header
        header = next(csv_reader, None)
        if not header:
            raise HTTPException(status_code=400, detail="CSV vazio ou sem header")
        
        # Processa linha por linha
        for row in csv_reader:
            line_number += 1
            parsed = parse_csv_row(row, line_number)
            
            if parsed and "error" in parsed:
                skipped_count += 1
                if len(errors) < MAX_ERROR_EXAMPLES:
                    errors.append(parsed["error"])
                continue
            
            if parsed:
                current_batch.append(parsed)
                
                # Processa batch quando atingir o tamanho
                if len(current_batch) >= BATCH_SIZE:
                    try:
                        inserted, updated = upsert_cities_batch(session, current_batch)
                        inserted_count += inserted
                        updated_count += updated
                        current_batch = []
                    except Exception as e:
                        session.rollback()
                        error_msg = f"Erro ao processar batch na linha {line_number}: {str(e)}"
                        if len(errors) < MAX_ERROR_EXAMPLES:
                            errors.append(error_msg)
                        skipped_count += len(current_batch)
                        current_batch = []
        
        # Processa o último batch se houver
        if current_batch:
            try:
                inserted, updated = upsert_cities_batch(session, current_batch)
                inserted_count += inserted
                updated_count += updated
            except Exception as e:
                session.rollback()
                error_msg = f"Erro ao processar último batch: {str(e)}"
                if len(errors) < MAX_ERROR_EXAMPLES:
                    errors.append(error_msg)
                skipped_count += len(current_batch)
    
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")
    
    return {
        "inserted": inserted_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "total_processed": line_number,
        "errors": errors,
        "message": f"Processado: {inserted_count} inseridas, {updated_count} atualizadas, {skipped_count} ignoradas"
    }


@router.get(
    "",
    response_model=List[CityRead],
    summary="List cities",
    description="List cities with optional filters by country and city prefix, with pagination support. Results are ordered by country.",
    response_description="List of cities matching the criteria",
    tags=["cities"]
)
async def get_cities(
    country: Optional[str] = None,
    prefix: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    """
    Lista cidades com filtros opcionais.
    
    **Parâmetros**:
    - country: Filtrar por nome do país (opcional, case-insensitive, partial match)
    - prefix: Filtrar por prefixo do nome da cidade em ASCII (opcional, case-insensitive)
    - limit: Número máximo de resultados (padrão: 100, máximo: 1000)
    - offset: Número de resultados para pular (padrão: 0)
    
    **Retorno**: Lista de cidades ordenada por país (country).
    """
    query = select(City)
    
    if country:
        query = query.where(City.country.ilike(f"%{country}%"))
    
    if prefix:
        query = query.where(City.city_ascii.ilike(f"{prefix}%"))
    
    query = query.order_by(City.country).limit(limit).offset(offset)
    
    cities = session.exec(query).all()
    return cities


class CitiesResponse(BaseModel):
    """Response model for cities endpoints with count and data"""
    count: int = Field(..., description="Number of cities returned")
    data: List[CityRead] = Field(..., description="List of cities")


@router.get(
    "/radius",
    response_model=CitiesResponse,
    summary="Find cities within radius",
    description="Find all cities within a specified radius (in kilometers) of one or more reference cities",
    response_description="Cities within the radius with count",
    tags=["cities"]
)
async def get_cities_within_radius(
    city_ids: List[int] = Query(..., description="List of city IDs to use as reference points", min_length=1),
    radius_km: float = Query(..., description="Radius in kilometers", gt=0),
    session: Session = Depends(get_session)
):
    """
    Encontra todas as cidades dentro de um raio especificado de uma ou mais cidades de referência.
    
    **Parâmetros**:
    - city_ids: Lista de IDs de cidades de referência (mínimo 1)
    - radius_km: Raio em quilômetros (deve ser maior que 0)
    
    **Funcionamento**:
    1. Busca as cidades de referência pelos IDs fornecidos
    2. Para cada cidade de referência, encontra todas as cidades dentro do raio especificado
    3. Usa a fórmula de Haversine para calcular distâncias na superfície da Terra
    4. Retorna todas as cidades encontradas (sem duplicatas)
    
    **Tratamento de Coordenadas Negativas**:
    - Latitude negativa: Sul do equador (ex: -23.5505 para São Paulo)
    - Longitude negativa: Oeste do meridiano de Greenwich (ex: -46.6333 para São Paulo)
    - A fórmula de Haversine trata corretamente valores negativos convertendo para radianos
    
    **Retorno**:
    - Lista de cidades dentro do raio (formato igual ao GET /api/v1/cities)
    - Se uma cidade está dentro do raio de múltiplas cidades de referência, aparece apenas uma vez
    """
    
    # Fetch reference cities
    reference_cities = session.exec(
        select(City).where(City.id.in_(city_ids))
    ).all()
    
    if not reference_cities:
        raise HTTPException(status_code=404, detail="No reference cities found with the provided IDs")
    
    if len(reference_cities) < len(city_ids):
        found_ids = {city.id for city in reference_cities}
        missing_ids = set(city_ids) - found_ids
        raise HTTPException(
            status_code=404,
            detail=f"Some city IDs were not found: {sorted(missing_ids)}"
        )
    
    # Get all cities (we'll filter by distance in Python)
    # For large datasets, this could be optimized with a bounding box query
    all_cities = session.exec(select(City)).all()
    
    # Find cities within radius
    cities_within_radius: Dict[int, City] = {}
    
    for ref_city in reference_cities:
        for city in all_cities:
            # Skip the reference city itself
            if city.id == ref_city.id:
                continue
            
            # Calculate distance using Haversine formula
            distance = haversine_distance(
                ref_city.lat, ref_city.lng,
                city.lat, city.lng
            )
            
            # Check if within radius
            if distance <= radius_km:
                # If city already found, just add it (deduplicate by ID)
                if city.id not in cities_within_radius:
                    cities_within_radius[city.id] = city
    
    # Convert to response format (just the cities, same format as GET /api/v1/cities)
    result = list(cities_within_radius.values())
    
    return CitiesResponse(count=len(result), data=result)
