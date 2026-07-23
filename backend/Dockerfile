# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./

RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

# Apply pending migrations before booting, otherwise a fresh DB has no tables.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
