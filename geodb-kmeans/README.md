# GeoDB K-means Clustering

Aplicação web para carregamento massivo de dados de cidades da GeoDB Cities API e clustering usando K-means paralelizado com Web Workers e SharedArrayBuffer.

## 🚀 Funcionalidades

- **Busca e Paginação**: Busca cidades por nome com paginação assíncrona
- **Seleção de Cidades**: Seleciona cidades para análise
- **Carregamento Massivo Paralelo**: Carrega ~10.000 cidades usando múltiplos Web Workers
- **K-means Paralelizado**: Clustering usando K-means com processamento paralelo
- **Visualização de Clusters**: Visualiza resultados com métricas e amostras
- **Exportação**: Exporta resultados em JSON
- **Cancelamento**: Cancela operações em andamento

## 📋 Pré-requisitos

- Node.js 20.19+ ou 22.12+
- npm ou yarn
- Chave da API RapidAPI (GeoDB Cities)

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <repository-url>
cd geodb-kmeans
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
Crie um arquivo `.env` na raiz do projeto:
```
VITE_RAPIDAPI_KEY=sua_chave_aqui
VITE_RAPIDAPI_HOST=wft-geo-db.p.rapidapi.com
```

Para obter uma chave da API:
1. Acesse [RapidAPI GeoDB Cities](https://rapidapi.com/wirefreethought/api/geodb-cities)
2. Inscreva-se e obtenha sua chave
3. Adicione a chave no arquivo `.env`

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

5. Acesse `http://localhost:5173` no navegador

**Nota**: Para usar SharedArrayBuffer, é necessário executar em HTTPS ou localhost.

## 🧪 Teste Manual Guiado

### 1. Navegar Páginas

1. **Inicie a aplicação** e aguarde o carregamento
2. **Digite um nome de cidade** no campo de busca (ex: "São")
3. **Clique em "Buscar"** ou pressione Enter
4. **Verifique os resultados** na coluna "Resultados da API"
5. **Clique em "Próxima página"** para ver mais resultados
6. **Clique em "Página anterior"** para voltar
7. **Verifique** que a página atual e total carregado são atualizados

**Resultado esperado**: 
- Lista de cidades é exibida
- Paginação funciona corretamente
- Informações de página são atualizadas

### 2. Selecionar Cidades

1. **Na lista de resultados**, clique em "Adicionar" em algumas cidades
2. **Verifique** que as cidades aparecem na coluna "Cidades Selecionadas"
3. **Verifique** que o contador "Total" é atualizado
4. **Verifique** que o botão "Adicionar" fica desabilitado para cidades já selecionadas
5. **Navegue para outra página** e volte
6. **Verifique** que as cidades selecionadas permanecem selecionadas
7. **Clique em "Remover"** em uma cidade selecionada
8. **Verifique** que a cidade é removida da lista
9. **Clique em "Limpar selecionadas"**
10. **Verifique** que todas as cidades são removidas

**Resultado esperado**:
- Cidades podem ser adicionadas e removidas
- Estado de seleção é preservado entre páginas
- Botões refletem corretamente o estado de seleção
- Contador é atualizado corretamente

### 3. Carregar 10k Cidades

1. **Configure o valor de k** no campo "k (número de clusters)" (ex: 5)
2. **Clique em "Carregar ~10k cidades (paralelo) + Rodar K-means"**
3. **Observe**:
   - Status muda para "loading"
   - Barra de progresso atualiza
   - Logs mostram progresso do carregamento
   - Botão "Cancelar" aparece
4. **Aguarde** o carregamento completar
5. **Verifique** nos logs:
   - Número de workers usados
   - Progresso do carregamento
   - Total de cidades carregadas
   - Tempo de carregamento

**Resultado esperado**:
- Carregamento paralelo funciona
- Progresso é atualizado em tempo real
- ~10.000 cidades são carregadas
- Métricas são exibidas

### 4. Rodar K-means

1. **Após o carregamento**, o K-means inicia automaticamente
2. **Observe**:
   - Status muda para "clustering"
   - Logs mostram iterações
   - Progresso atualiza
3. **Aguarde** a convergência
4. **Verifique** nos logs:
   - Número de iterações
   - Mudança média por iteração
   - Mensagem de convergência
   - Tempo de execução do K-means

**Resultado esperado**:
- K-means executa em paralelo
- Convergência é alcançada
- Métricas são coletadas
- Clusters são criados

### 5. Verificar Clusters

1. **Após o K-means concluir**, verifique a seção "Clusters"
2. **Verifique** que cada cluster mostra:
   - Número do cluster e tamanho (n=...)
   - Coordenadas do centroide (lat/lon/pop)
   - Lista de cidades (amostra de até 30)
3. **Use o filtro** "Filtrar por cluster":
   - Selecione um cluster específico
   - Verifique que apenas aquele cluster é exibido
   - Selecione "Todos" para ver todos novamente
4. **Verifique o painel "Métricas"**:
   - Tempo de carregamento 10k
   - Tempo total do K-means
   - Iterações
   - Workers usados
5. **Clique em "Exportar JSON"**
6. **Verifique** que um arquivo JSON é baixado com:
   - Todos os clusters
   - Métricas
   - Timestamp de exportação

**Resultado esperado**:
- Clusters são exibidos corretamente
- Filtro funciona
- Métricas são precisas
- Exportação funciona

### 6. Teste de Cancelamento

1. **Inicie** o carregamento de 10k cidades
2. **Durante o carregamento**, clique em "Cancelar"
3. **Verifique**:
   - Operação é interrompida
   - Status volta para "idle"
   - Workers são terminados
   - Logs mostram mensagem de cancelamento
4. **Repita** durante o K-means

**Resultado esperado**:
- Cancelamento funciona em ambos os estágios
- Estado é resetado corretamente
- UI permanece funcional

### 7. Teste de Erros

1. **Desconfigure a API key** temporariamente (comente no .env)
2. **Tente buscar** uma cidade
3. **Verifique** que:
   - Erro é exibido no painel de erro
   - UI permanece funcional
   - Botão "Fechar" remove o erro
4. **Reconfigure** a API key e teste novamente

**Resultado esperado**:
- Erros são tratados graciosamente
- Mensagens de erro são claras
- UI não quebra

## 🏗️ Estrutura do Projeto

```
geodb-kmeans/
├── src/
│   ├── app/
│   │   ├── state.js          # Store Redux-like
│   │   ├── reducer.js        # Reducers
│   │   ├── actions.js        # Action creators
│   │   ├── selectors.js      # Selectors
│   │   ├── render.js         # Renderização declarativa
│   │   ├── events.js         # Event handlers
│   │   ├── bootstrap.js      # Inicialização
│   │   └── initialState.js   # Estado inicial
│   ├── api/
│   │   ├── geodbClient.js    # Cliente GeoDB API
│   │   ├── rateLimit.js      # Rate limiting
│   │   └── paging.js         # Utilitários de paginação
│   ├── workers/
│   │   ├── fetchWorker.js    # Worker para buscar cidades
│   │   ├── kmeansWorker.js  # Worker para K-means
│   │   ├── workerPool.js     # Pool de workers
│   │   └── sharedMemory.js   # Memória compartilhada
│   ├── kmeans/
│   │   ├── distance.js      # Funções de distância
│   │   ├── init.js           # Inicialização de centroides
│   │   ├── kmeans.js         # Orquestrador K-means
│   │   └── math.js           # Funções matemáticas
│   ├── ui/
│   │   ├── dom.js            # Helpers DOM
│   │   ├── templates.js      # Templates HTML
│   │   └── styles.css        # Estilos
│   └── main.js               # Entry point
├── index.html
├── package.json
└── README.md
```

## 🔑 Conceitos Implementados

- **Store Funcional**: Mini-Redux sem dependências externas
- **Web Workers**: Processamento paralelo em background
- **SharedArrayBuffer**: Memória compartilhada entre threads
- **Rate Limiting**: Controle de requisições à API
- **Race Condition Prevention**: Request IDs para evitar condições de corrida
- **Renderização Declarativa**: UI reativa sem frameworks
- **Event Delegation**: Listeners eficientes

## 📝 Scripts Disponíveis

- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run preview` - Preview do build de produção

## ⚠️ Notas Importantes

1. **SharedArrayBuffer**: Requer HTTPS ou localhost (requisito de segurança do navegador)
2. **API Rate Limits**: A API tem limites de requisições - o código implementa rate limiting
3. **Performance**: Para grandes datasets, o carregamento pode levar alguns minutos
4. **Workers**: O número de workers é determinado automaticamente baseado no hardware

## 🐛 Troubleshooting

**Problema**: SharedArrayBuffer não disponível
- **Solução**: Execute em HTTPS ou localhost

**Problema**: Erro de API
- **Solução**: Verifique se `VITE_RAPIDAPI_KEY` está configurado corretamente no `.env`

**Problema**: Workers não funcionam
- **Solução**: Verifique se está usando um navegador moderno com suporte a Web Workers

## 📄 Licença

Este projeto é um trabalho acadêmico.
