FROM node:26-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates util-linux poppler-utils tesseract-ocr tesseract-ocr-pol && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.33.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN DATABASE_URL=mysql://build:build@localhost:3306/build pnpm db:generate && pnpm typecheck && pnpm build

FROM build AS runtime-dependencies
RUN CI=true pnpm prune --prod

FROM node:26-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates util-linux poppler-utils tesseract-ocr tesseract-ocr-pol && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=runtime-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3001
CMD ["node", "dist/api.js"]

FROM nginxinc/nginx-unprivileged:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/health || exit 1
