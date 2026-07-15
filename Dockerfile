# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js "standalone" Output enthält bereits einen minimalen Server + node_modules

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# tesseract.js startet seinen Worker per worker_threads mit einem dynamischen
# Dateipfad (new Worker(workerPath)). Next.js' Standalone-Output-Tracing kann
# das nicht statisch erkennen, daher werden die Pakete hier manuell ergänzt.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core

# @napi-rs/canvas wird von pdf-parse nur in einem try/catch dynamisch
# nachgeladen (Fallback-Polyfill für DOMMatrix/Path2D/ImageData) und daher vom
# Output-Tracing ebenfalls übersprungen.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@napi-rs ./node_modules/@napi-rs

# Datenverzeichnis für persistente JSON-DB (wird i.d.R. per Fly-Volume gemountet)
RUN mkdir -p /data && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
