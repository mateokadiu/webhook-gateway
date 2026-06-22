FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:5001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/admin apps/admin
RUN pnpm --filter @webhook-gateway/shared build
RUN pnpm --filter @webhook-gateway/admin build

FROM node:22-alpine AS runner
WORKDIR /repo/apps/admin
ENV NODE_ENV=production
COPY --from=build /repo/apps/admin/.next/standalone /repo
COPY --from=build /repo/apps/admin/.next/static /repo/apps/admin/.next/static
COPY --from=build /repo/apps/admin/public /repo/apps/admin/public
EXPOSE 5000
CMD ["node", "/repo/apps/admin/server.js"]
