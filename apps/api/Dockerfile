FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/plugin-hmac/package.json packages/plugin-hmac/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @webhook-gateway/shared build && \
    pnpm --filter @webhook-gateway/plugin-sdk build && \
    pnpm --filter @webhook-gateway/plugin-hmac build && \
    pnpm --filter @webhook-gateway/api build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/src/drizzle apps/api/src/drizzle
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY --from=build /repo/packages/plugin-sdk/dist packages/plugin-sdk/dist
COPY --from=build /repo/packages/plugin-hmac/package.json packages/plugin-hmac/package.json
COPY --from=build /repo/packages/plugin-hmac/dist packages/plugin-hmac/dist
RUN pnpm install --prod --frozen-lockfile=false
EXPOSE 5001
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
