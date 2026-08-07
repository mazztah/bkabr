# TODO — Fly.io Logs in LLM Mission Control Live-Systemlogs

- [x] Plan approved (Fly logs merged into Live-Systemlogs with "FLY" source badge)
- [x] 1. Add `nats` dependency to package.json + serverExternalPackages in next.config.ts
- [x] 2. Create `src/lib/fly-logs.ts` (NATS subscriber + in-memory ring buffer)
- [x] 3. Hook `startFlyLogTicker()` into `src/instrumentation.ts`
- [x] 4. Extend `getSystemLogStream()` in `src/lib/observability-stream.ts` to include `flyLog`
- [x] 5. Include `flyLog` in `/api/dashboard/log-stream` SSE init/log events
- [x] 6. Update Mission Control `LiveLogs` to render merged logs with "FLY" source badge + connection status
- [x] 7. `npm install` + `npm run build` to verify
