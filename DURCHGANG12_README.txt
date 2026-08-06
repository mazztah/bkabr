Durchgang 12 – Stammdaten & Dokumente vollständig (CRUD)

Neue Agent-Tools:
- create_liegenschaft
- list_gebaeude, update_gebaeude, reassign_gebaeude
- create_wohnung, reassign_wohnung
- create_mieter
- create_mietvertrag, update_mietvertrag
- list_pm_vertraege, create_pm_vertrag, update_pm_vertrag, delete_pm_vertrag
- list_eigentuemer, create_eigentuemer, update_eigentuemer, delete_eigentuemer
- create_abrechnung, reassign_abrechnung
- rename_ablage_dokument, set_ablage_status

API:
- PATCH /api/ablage/[id] akzeptiert jetzt dateiName (Umbenennen)

Ebenfalls enthalten (Durchgang 11, falls noch nicht deployed):
- /api/dashboard/ai-observatory
- groq-client: Token-Cap ≤5000 + Usage-Logging
- AiObservatory.tsx Fehler-Fallback
- agent.ts JSON-Parse-Klarheit

Drop-in: Dateien über das bestehende Repo legen und neu bauen/deployen.
