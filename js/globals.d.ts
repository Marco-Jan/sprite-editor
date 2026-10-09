// Typen für das, was es im Browser wirklich gibt, aber nicht in den
// Standard-Typen steht. Reine Beschreibung — diese Datei wird nie geladen,
// weder vom Browser noch vom Service Worker. Sie existiert nur für
// `npm run check` (siehe jsconfig.json).

interface Window {
  /** jsPDF aus vendor/jspdf.umd.min.js, eingebunden in editor.html. */
  jspdf?: { jsPDF: new (opts?: any) => any };
  /** File System Access API — Chrome/Edge; anderswo gibt es den Download. */
  showDirectoryPicker?: (opts?: {
    mode?: 'read' | 'readwrite';
    id?: string;
  }) => Promise<any>;
  /** Links nach draussen der Startseite (js/site-links.js); leer = gibt es noch nicht. */
  SITE_LINKS?: Record<string, string>;
  /** Versionen an den Knöpfen der Startseite (js/site-links.js, gepflegt von tools/deploy.py). */
  SITE_VERSIONS?: Record<string, string>;
  /** Bitty, das Maskottchen (js/bitty.js) — Startseite und Editor. */
  Bitty?: {
    PALETTE: string[];
    FRAMES: Record<'idle' | 'squish' | 'blink' | 'hop', string[]>;
    draw(canvas: HTMLCanvasElement, name: string, palette?: string[]): void;
    mount(canvas: HTMLCanvasElement, opts?: { palette?: string[] }): {
      hop(): void;
      setPalette(p?: string[]): void;
      stop(): void;
    };
  };
}

interface Navigator {
  /** Nur Safari: true, wenn die Seite als Web-App vom Home-Bildschirm läuft. */
  standalone?: boolean;
  /** Altes IE-Feld; manche Browser liefern es noch als Rückfall. */
  userLanguage?: string;
}

// ── DOM-Abfragen liefern hier HTML-Elemente ─────────────────────────
// Die Standard-Typen versprechen nur `Element` — ohne .dataset, .style,
// .title, .hidden oder .offsetWidth. In dieser App kommt aus jeder Abfrage
// ein HTML-Element; diese Überladungen sagen das einmal, statt an rund
// hundert Fundstellen einen Cast zu verlangen.
//
// Bewusst `HTMLElement` und nicht `any`: ein Tippfehler wie `el.hiden = true`
// fällt weiterhin auf.
interface ParentNode {
  querySelector(selectors: string): HTMLElement;
  querySelectorAll(selectors: string): NodeListOf<HTMLElement>;
}
interface Document {
  getElementById(elementId: string): HTMLElement;
}
interface Element {
  closest(selectors: string): HTMLElement;
}
