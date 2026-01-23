# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables (Vite embeds these at build time)
ARG VITE_RAPIDAPI_KEY
ARG VITE_RAPIDAPI_HOST=wft-geo-db.p.rapidapi.com

# Set environment variables for build
ENV VITE_RAPIDAPI_KEY=${VITE_RAPIDAPI_KEY}
ENV VITE_RAPIDAPI_HOST=${VITE_RAPIDAPI_HOST}

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
