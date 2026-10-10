# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Build the React + Vite Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install frontend dependencies first (optimizes Docker cache layers)
COPY Frontend/Echo/package*.json ./Frontend/Echo/
RUN cd Frontend/Echo && (npm ci || npm install)

# Copy frontend source code
COPY Frontend/Echo ./Frontend/Echo

# Build frontend to produce production static bundle in /app/Frontend/Echo/dist
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN cd Frontend/Echo && npm run build

# ==========================================
# Stage 2: Production Server (Node.js + Express)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app/Backend

# Define environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Install backend production dependencies only
COPY Backend/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend application source
COPY Backend/ ./

# Copy compiled frontend static assets from Stage 1 into Backend/public
COPY --from=frontend-builder /app/Frontend/Echo/dist ./public

# Railway dynamically injects $PORT at runtime (defaults to 3000)
EXPOSE 3000

# Run Express server
CMD ["node", "server.js"]
