# Kindred Tech Support - production image (web app and background worker)
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# Run as an unprivileged user
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000
# Web: apply migrations, then serve. The worker service overrides this with `npm run worker`.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
