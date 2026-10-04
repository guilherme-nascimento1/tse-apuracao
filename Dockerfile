FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --no-fund
RUN npm run build -w @tse/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 WEB_DIST=/app/apps/web/dist
COPY --from=build /app /app
RUN npm prune --omit=dev --workspaces --include-workspace-root 2>/dev/null || true
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["npm", "run", "start", "-w", "@tse/api"]
