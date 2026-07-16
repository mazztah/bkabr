import DOMMatrixPolyfill from "dommatrix";

// pdfjs-dist (genutzt von pdf-parse) benötigt DOMMatrix für Text-Positionsmatrizen,
// auch wenn nur reiner Text extrahiert wird (keine Bild-Rendering nötig). In Node
// existiert DOMMatrix nicht. @napi-rs/canvas liefert das zwar auch, ist aber ein
// natives Binary mit Plattform-/libc-spezifischen Builds (glibc vs. musl/Alpine) –
// das war vermutlich die Ursache, warum PDF-Analyse in Produktion (Alpine) fehlschlug,
// obwohl es lokal (glibc) funktionierte. Dieser reine JS-Polyfill hat keine solche
// Plattformabhängigkeit.
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = DOMMatrixPolyfill;
}
