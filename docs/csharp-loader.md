# JSON (Spiel) — Format und C#-Loader

Das Exportformat **„JSON (Spiel)“** ist für Spiele gedacht, die Sprites als Zellraster einlesen,
etwa eine Falling-Sand-Simulation in C# (.NET 10). Es lässt sich mit `System.Text.Json`
ohne Umbau deserialisieren. Erzeugt wird es in `js/gamejson.js`, die Tests liegen in
`tests/gamejson.test.js` (`node --test`).

## Format (Version 1)

```json
{
  "version": 1,
  "name": "test_sprite",
  "width": 3,
  "height": 2,
  "palette": [
    { "color": "#00000000", "material": "empty" },
    { "color": "#c2b280ff", "material": "sand" },
    { "color": "#4a90d9ff", "material": "water" }
  ],
  "data": [
    0, 1, 2,
    2, 1, 0
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `version` | Pflicht, aktuell `1`. Spätere Änderungen am Format erhöhen sie. |
| `name` | Sprite-Name als `snake_case` (Umlaute ausgeschrieben: „Grün“ → `gruen`). Gleich dem Dateinamen. |
| `width`, `height` | Größe in Pixeln, ganze Zahlen `>= 1`. |
| `palette` | Dichte Liste. Index `0` ist immer `#00000000` / `empty`. Farben als `#rrggbbaa`, klein. |
| `data` | Flaches Array, Länge `width * height`, zeilenweise: Index = `y * width + x`. Jeder Wert ist ein Palettenindex. Eine Textzeile pro Bildzeile. |
| `sprites` | Optional, für Atlanten: `{ "name": { "x", "y", "w", "h", "frames" } }`. Der Editor schreibt das Feld zurzeit **nicht** (siehe unten). |

### Palette im Editor-Export

- Die Palette kommt immer vollständig mit: Index `0` (leer) und `1`–`9` der Sprite-Palette,
  auch wenn nicht alle Farben benutzt werden. So haben alle Sprites mit derselben Palette
  dieselben Indizes.
- Freie Farben (Pipette, Rohfarben-Trace) folgen ab Index `10` mit Material `none`.

### Materialien

Feste Liste, steht in `js/gamejson.js` (`MATERIALS`) und wird dort erweitert:

`none`, `empty`, `sand`, `water`, `stone`, `ice`, `steam`, `metal`, `wood`

Im Editor erscheint bei Format „JSON (Spiel)“ unter dem Format-Dropdown eine Auswahl pro
Palettenfarbe. Die Zuordnung gilt pro Palette (also für alle Sprites, die sie benutzen),
auch für die eingebauten Paletten, und wird mit dem Projekt gespeichert. Ohne Angabe
wird `none` exportiert.

### Validierung beim Export

Der Editor bricht mit einer Meldung ab (kein Kopieren, kein Speichern), wenn:

- `data` nicht genau `width * height` Werte hat,
- ein Index außerhalb der Palette liegt,
- die Palette leer ist oder Index `0` nicht transparent ist,
- eine Farbe oder ein Material ungültig ist,
- ein `sprites`-Ausschnitt (samt aller Frames) nicht vollständig im Bild liegt.

## C#-Gegenseite

```csharp
using System.Text.Json;

public record PaletteEntry(string Color, string Material);
public record SpriteRegion(int X, int Y, int W, int H, int Frames = 1);
public record SpriteData(
    int Version,
    string Name,
    int Width,
    int Height,
    PaletteEntry[] Palette,
    int[] Data,
    Dictionary<string, SpriteRegion>? Sprites = null);

public static class SpriteLoader
{
    private static readonly JsonSerializerOptions Options =
        new(JsonSerializerDefaults.Web);

    public static SpriteData Load(string path)
    {
        var sprite = JsonSerializer.Deserialize<SpriteData>(File.ReadAllText(path), Options)
            ?? throw new InvalidDataException($"Leere Sprite-Datei: {path}");

        if (sprite.Version != 1)
            throw new InvalidDataException($"Unbekannte Version {sprite.Version}");
        if (sprite.Data.Length != sprite.Width * sprite.Height)
            throw new InvalidDataException("data passt nicht zu width * height");

        return sprite;
    }
}
```

Zugriff auf ein Pixel: `sprite.Data[y * sprite.Width + x]`, das Material dazu:
`sprite.Palette[sprite.Data[y * sprite.Width + x]].Material`.

`JsonSerializerDefaults.Web` sorgt für camelCase und Groß-/Kleinschreibung-unabhängige
Namen. Fehlt `sprites` in der Datei, ist `Sprites` `null`.

Geprüft mit .NET 10: ein 160×120-Berg-Hintergrund aus dem Editor lädt mit
`Data.Length == Width * Height` (19 200).

## Was der Editor (noch) nicht kann

- **Keine Atlanten/Frames:** Ein Sprite ist im Editor ein einzelnes Raster ohne Frames.
  `sprites` wird deshalb nicht geschrieben. Format und Validierung kennen das Feld schon.
- **Kein Re-Import:** „JSON (Spiel)“ ist eine Einbahnstraße. Zum Weiterbearbeiten das
  Projekt speichern oder das normale JSON nehmen.
- Kein Binärformat und keine Kompression.
