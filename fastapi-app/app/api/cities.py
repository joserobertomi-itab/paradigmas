import csv
import io
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import get_session
from app.models.city import City
from app.schemas.city import CityRead
from typing import Optional, List

router = APIRouter(prefix="/cities", tags=["cities"])

BATCH_SIZE = 5000
MAX_ERROR_EXAMPLES = 10


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
            lat = Decimal(clean_row[2])  # lat
        except (ValueError, InvalidOperation, IndexError):
            return {"error": f"Linha {line_number}: Latitude inválida: {clean_row[2] if len(clean_row) > 2 else 'N/A'}"}
        
        try:
            lng = Decimal(clean_row[3])  # lng
        except (ValueError, InvalidOperation, IndexError):
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
    description="List cities with optional filters by country, with pagination support",
    response_description="List of cities matching the criteria",
    tags=["cities"]
)
async def get_cities(
    country: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    """
    Lista cidades com filtros opcionais.
    
    **Parâmetros**:
    - country: Filtrar por nome do país (opcional, case-insensitive, partial match)
    - limit: Número máximo de resultados (padrão: 100, máximo: 1000)
    - offset: Número de resultados para pular (padrão: 0)
    
    **Retorno**: Lista de cidades
    """
    query = select(City)
    
    if country:
        query = query.where(City.country.ilike(f"%{country}%"))
    
    query = query.limit(limit).offset(offset)
    
    cities = session.exec(query).all()
    return cities
