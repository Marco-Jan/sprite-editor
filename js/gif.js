// ════════════════════════════════════════════════════════════════════
// GIF — animiertes GIF89a aus Index-Bildern, ohne Bibliothek
// ════════════════════════════════════════════════════════════════════
// Pixel-Art passt ideal zu GIF: höchstens 255 Farben plus Transparent,
// harte Kanten, keine Kompressionsverluste. Eine globale Farbtabelle für
// alle Frames, Index 0 ist transparent. Jeder Frame wird vor dem nächsten
// gelöscht (Disposal 2) — sonst blieben Pixel stehen, die im nächsten Frame
// transparent sein sollen. Die Animation läuft endlos (NETSCAPE2.0).
//
// encodeGif({ width, height, colors, frames, delays }) → Uint8Array
//   colors — ['#rrggbb', …] für die Indizes 1…n (Index 0 = transparent)
//   frames — [Uint8Array(width * height), …] mit Farbindizes
//   delays — Dauer je Frame in ms

export function encodeGif({ width, height, colors, frames, delays }) {
  const out = [];
  const u8 = b => out.push(b & 255);
  const u16 = v => { u8(v); u8(v >> 8); };
  const str = s => { for (let i = 0; i < s.length; i++) u8(s.charCodeAt(i)); };

  // Tabelle: Index 0 transparent + Farben, auf eine Zweierpotenz aufgefüllt.
  const count = colors.length + 1;
  let bits = 1;
  while ((1 << bits) < count) bits++;
  const size = 1 << bits;

  str('GIF89a');
  u16(width);
  u16(height);
  u8(0x80 | 0x70 | (bits - 1));   // globale Tabelle, 8 Bit Farbtiefe, Größe
  u8(0);                          // Hintergrund = Index 0
  u8(0);                          // Seitenverhältnis
  for (let i = 0; i < size; i++) {
    const hex = i >= 1 && i <= colors.length ? colors[i - 1] : '#000000';
    u8(parseInt(hex.slice(1, 3), 16));
    u8(parseInt(hex.slice(3, 5), 16));
    u8(parseInt(hex.slice(5, 7), 16));
  }

  // Endlosschleife
  u8(0x21); u8(0xff); u8(11); str('NETSCAPE2.0'); u8(3); u8(1); u16(0); u8(0);

  const minCode = Math.max(2, bits);
  frames.forEach((px, f) => {
    // Graphic Control: Disposal 2, Transparenz an, Dauer in 1/100 s.
    // Unter 2/100 s spielen viele Programme mit 1/10 s ab — darum mindestens 2.
    u8(0x21); u8(0xf9); u8(4);
    u8((2 << 2) | 1);
    u16(Math.max(2, Math.round((delays[f] || 100) / 10)));
    u8(0);
    u8(0);
    // Bildbeschreibung: ganzes Bild, keine lokale Tabelle.
    u8(0x2c); u16(0); u16(0); u16(width); u16(height); u8(0);
    u8(minCode);
    const data = lzw(px, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      u8(n);
      for (let k = 0; k < n; k++) out.push(data[i + k]);
    }
    u8(0);
  });

  u8(0x3b);
  return Uint8Array.from(out);
}

// LZW mit variabler Codelänge, wie GIF sie verlangt. Die Codelänge wächst,
// sobald der nächste freie Code nicht mehr hineinpasst; bei 4096 Einträgen
// beginnt das Wörterbuch mit einem Clear-Code von vorn.
function lzw(px, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  const bytes = [];
  let cur = 0, nbits = 0;
  const emit = code => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) { bytes.push(cur & 255); cur >>>= 8; nbits -= 8; }
  };

  emit(clear);
  let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    } else {
      if (next >= (1 << size)) size++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (nbits > 0) bytes.push(cur & 255);
  return bytes;
}
