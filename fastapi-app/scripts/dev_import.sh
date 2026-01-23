#!/bin/bash

set -e

echo "🚀 Iniciando processo de importação de desenvolvimento..."

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo -e "${BLUE}📦 Subindo Docker Compose...${NC}"
docker-compose up -d

echo -e "${BLUE}⏳ Aguardando serviços ficarem prontos...${NC}"
sleep 5

echo -e "${BLUE}🗄️  Executando migrações...${NC}"
docker-compose exec -T api alembic upgrade head

echo -e "${BLUE}📤 Importando cidades do arquivo sample...${NC}"
if command -v jq &> /dev/null; then
    curl -X POST "http://localhost:8000/api/v1/cities/import" \
      -F "file=@data/worldcities.csv" \
      -w "\n" \
      | jq '.'
else
    echo -e "${YELLOW}⚠️  jq não encontrado, exibindo resposta sem formatação${NC}"
    curl -X POST "http://localhost:8000/api/v1/cities/import" \
      -F "file=@data/worldcities.csv"
fi

echo -e "\n${GREEN}✅ Importação concluída!${NC}"

echo -e "\n${BLUE}🔍 Buscando cidades do Japan...${NC}"
if command -v jq &> /dev/null; then
    curl -X GET "http://localhost:8000/api/v1/cities?country=Japan" \
      -w "\n" \
      | jq '.'
else
    curl -X GET "http://localhost:8000/api/v1/cities?country=Japan"
fi

echo -e "\n${GREEN}✨ Processo completo!${NC}"
