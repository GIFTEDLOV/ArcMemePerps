FROM node:22-bookworm-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY evidence/gate4i/product-deployment.json ./evidence/gate4i/product-deployment.json

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["pnpm", "exec", "tsx", "scripts/product-release-service.ts"]
