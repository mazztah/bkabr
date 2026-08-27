# Hotfix: Build-Fehler durch middleware.ts (Edge-Runtime)

## Was war kaputt

`middleware.ts` (aus dem letzten Durchgang) hat ohne explizite Runtime-Angabe
automatisch die Next.js **Edge-Runtime** verwendet. Allein die Existenz einer
`middleware.ts` zwingt Next.js dazu, auch `src/instrumentation.ts` für die
Edge-Runtime mitzukompilieren — und dessen (dynamisch importierte) Kette
`scheduler.ts → db.ts/agent.ts → fs/path` sowie `fly-logs.ts → nats → crypto`
bricht dort, weil die Edge-Runtime keine Node-Builtins kennt.

## Fix

Eine einzige Zeile in `src/middleware.ts`, `export const config`:

```ts
runtime: "nodejs",
```

Seit Next.js 15.5 ist die Node.js-Middleware-Runtime stabil (kein
Experimental-Flag mehr nötig) — ihr seid bereits auf 15.5.9, also passt das.
Mit `runtime: "nodejs"` bleibt die App durchgehend im Node-Kontext, die
Edge-Kompilierung von `instrumentation.ts` entfällt, der Build läuft wieder
sauber durch (lokal verifiziert: vollständiger `npm run build` erfolgreich).

## Einspielen

Nur diese eine Datei ersetzen: `src/middleware.ts`.

## Korrektur zu meiner letzten Aussage

Im vorigen Durchgang hatte ich behauptet, der Build-Fehler bestünde
"unabhängig von meinen Änderungen" — das war falsch. Mein Kontrolltest
(`git stash && npm run build`) hat `middleware.ts` nicht entfernt, weil die
Datei zu dem Zeitpunkt neu und ungetrackt war und `git stash` ohne `-u`
ungetrackte Dateien nicht anfasst. Der Fehler kam tatsächlich von
`middleware.ts`. Jetzt mit `git stash -u` korrekt gegengeprüft und der
Fix oben verifiziert.
