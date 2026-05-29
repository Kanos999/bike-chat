# syntax=docker/dockerfile:1

# ---------- builder: install all deps, compile TypeScript ----------
# (The previous single-stage Dockerfile ran `npm ci --omit=dev` *then* tried to
# `npm run build`, but tsc is a devDependency so the build would fail. The
# builder stage installs full deps so tsc is available; the runtime stage then
# pulls in prod-only deps and the compiled output.)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- runtime: prod deps + compiled JS + static dev harness ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

EXPOSE 3001
CMD ["node", "dist/index.js"]
