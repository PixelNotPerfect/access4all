/** Calcul du rapport de contraste WCAG entre deux couleurs hexadécimales. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

export interface ContrastVerdict {
  ratio: number;
  /** Texte courant : 4,5:1 (RGAA 3.2) */
  text: boolean;
  /** Texte de grande taille (24 px, ou 18,5 px gras) : 3:1 (RGAA 3.2) */
  largeText: boolean;
  /** Composants d'interface et éléments graphiques : 3:1 (RGAA 3.3) */
  ui: boolean;
}

export function verdict(fg: string, bg: string): ContrastVerdict | null {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return null;
  return { ratio, text: ratio >= 4.5, largeText: ratio >= 3, ui: ratio >= 3 };
}
