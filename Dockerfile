# --- deps & build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .

# `next build` evaluates env() while collecting page data, so the env schema
# must validate at build time. These placeholders exist only in the builder
# stage and never reach the runtime image; the real values are injected by the
# platform at run time. Build platforms that pass variables as --build-arg
# (Railway, Cloud Build) override them automatically.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ARG AUTH_SECRET="build-time-placeholder-secret-not-used-at-runtime"
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET

RUN npx prisma generate && npm run build

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER app
EXPOSE 3000
CMD ["node", "server.js"]
