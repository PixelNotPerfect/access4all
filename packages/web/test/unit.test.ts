import { describe, expect, it } from "vitest";
import { contrastRatio, verdict } from "../src/contrast.js";
import { emptyAudit, importCliReport, parseAudit } from "../src/state.js";

describe("contraste", () => {
  it("calcule les rapports de référence", () => {
    expect(contrastRatio("#000", "#fff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBe(4.48);
    expect(contrastRatio("#767676", "#fff")).toBe(4.54);
    expect(contrastRatio("rouge", "#fff")).toBeNull();
  });
  it("donne le verdict RGAA 3.2 / 3.3", () => {
    expect(verdict("#949494", "#fff")).toMatchObject({ text: false, largeText: true, ui: true });
  });
});

describe("audit", () => {
  it("importe un rapport de la CLI", () => {
    const a = emptyAudit();
    const report = JSON.stringify({
      pages: [
        { url: "https://exemple.fr/", failures: [{ criterion: "1.1" }, { criterion: "3.2" }] },
        { url: "https://exemple.fr/contact", failures: [{ criterion: "11.1" }] },
      ],
    });
    const r = importCliReport(a, report);
    expect(r).toEqual({ pages: 2, marked: 3 });
    expect(a.pages.map((p) => p.url)).toEqual(["https://exemple.fr/", "https://exemple.fr/contact"]);
    expect(a.pages[1].name).toBe("contact");
    expect(a.results[a.pages[0].id]).toEqual({ "1.1": "NC", "3.2": "NC" });
  });
  it("ne remplace pas un statut saisi à la main", () => {
    const a = emptyAudit();
    a.pages[0].url = "https://exemple.fr/";
    a.results[a.pages[0].id] = { "1.1": "C" };
    importCliReport(a, JSON.stringify({ pages: [{ url: "https://exemple.fr/", failures: [{ criterion: "1.1" }] }] }));
    expect(a.results[a.pages[0].id]["1.1"]).toBe("C");
  });
  it("refuse un fichier qui n'est pas un audit", () => {
    expect(() => parseAudit("{}")).toThrow(/pas un audit/);
    expect(() => importCliReport(emptyAudit(), "{}")).toThrow(/rapport JSON/);
  });
});
