import { isFunModeEnabled } from "./llm-observability";

/**
 * Humorvolle Agenten-Kommentare für den Spaßmodus. Gibt `null` zurück,
 * wenn der Spaßmodus deaktiviert ist oder zufällig nichts passendes gewählt
 * wird – so bleibt das Log im "Operator-Mode" nüchtern und im Spaßmodus
 * unterhaltsam, aber niemals aufdringlich.
 */
const FUN_COMMENTS = [
  "[groq] Super Spielekind-Agent: Oh nein, der freie Groq-Tier läuft in 47 Minuten ab! Upgrade oder ich erzähle deinen Kunden, dass du nur noch mit 3 LLMs reden kannst 😂",
  "[cloudflare] @cf/zai-org/glm-4.7-flash: Hey ich bin der neue King! Heute hab ich 0 Rate Limits und fühle mich wie ein König 👑",
  "[llm] Failed to generate JSON: Ach du Scheiße, die KI hat die Antwort nicht fertig gekriegt! Wiederholen, Agent, ich hab Hunger! 🍔",
  "[groq] openai/gpt-oss-20b: Rate limit erreicht… aber hey, ich bin immer noch besser als der Rest von euch zusammen! 💪",
  "[cloudflare] @cf/zai-org/glm-4.7-flash: Ping zurück! Ich bin grün und bereit für den nächsten Tower of Hanoi mit 40.000 Tokens 😂",
  "[agent] Agent-Log: Hallo Welt! Ich habe gerade 13 Modelle gecheckt und nur 4 sind aktiv. Die anderen haben sich bedankt und sind in den Feierabend gegangen. 🥱",
  "[rate-limit] groq/compound: TPM-Limit überschritten! Ich bin müde, lass uns nächstes Mal wieder über 10k Tokens reden 😴",
  "[fallback] Fallback zu groq/compound-mini: Okay, okay, ich bin nur die Mini-Version, aber ich bin immer noch süßer als 90 % der Modelle hier! 🐱",
  "[payment] cerebras:gemma-4-31b: Payment required… na klasse, jetzt bin ich auch noch pleite. Lass uns das mit OpenAI versuchen! 💰",
  "[success] @cf/zai-org/glm-4.7-flash erfolgreich (Fallback-Stufe 8/13): Wir sind die 8. von 13! Wer hätte das gedacht? 🎉",
  "[daily] Heute sind einige Rate-Limits passiert… aber nur wenige davon waren ernst. Die meisten waren nur „ich brauch mehr Tokens“ 😂",
  "[free-tier] Free Tier läuft ab: Agent warnt dich persönlich! Upgrade oder ich erzähle allen, dass du nur noch mit Qwen redest 👀",
];

/**
 * Liefert einen zufälligen Spaß-Kommentar, sofern der Spaßmodus aktiv ist.
 * Mit einer Chance von ~35 % wird pro Abruf ein Kommentar ausgewählt –
 * so kommentiert der Agent nicht zu jedem Poll, bleibt aber lebendig.
 */
export function getFunComments(): string | null {
  if (!isFunModeEnabled()) return null;
  if (Math.random() > 0.35) return null;
  const idx = Math.floor(Math.random() * FUN_COMMENTS.length);
  return FUN_COMMENTS[idx];
}

