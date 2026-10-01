FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    postgresql-client \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/platform-service-authenticator/package.json packages/platform-service-authenticator/package.json
COPY services/activity-manager/package.json services/activity-manager/package.json
COPY services/authentication-service/package.json services/authentication-service/package.json
COPY services/community-collaborator-stub/package.json services/community-collaborator-stub/package.json
COPY services/owner-pet-manager/package.json services/owner-pet-manager/package.json
COPY services/pet-health-service/package.json services/pet-health-service/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY services ./services
COPY docker ./docker
COPY tsconfig.base.json ./

RUN pnpm build \
  && chmod +x /app/docker/entrypoint.sh /app/docker/bootstrap.sh

ENV NODE_ENV=production
ENTRYPOINT ["/app/docker/entrypoint.sh"]
