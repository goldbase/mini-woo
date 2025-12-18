export function getPriceNumber(p: any): number | null {
  const candidates = [
    p?.sale_price,
    p?.price,
    p?.regular_price,
    p?.price_html, // fallback (HTML)
  ];

  for (const c of candidates) {
    if (c == null) continue;

    if (typeof c === "number" && !Number.isNaN(c)) return c;

    if (typeof c === "string") {
      const s = c.trim();

      // plain numeric string: "14800" or "14800.50"
      const plain = s.replace(",", ".");
      if (/^\d+(\.\d+)?$/.test(plain)) {
        const num = Number(plain);
        if (!Number.isNaN(num)) return num;
      }

      // HTML price: "<span>14 800 ₽</span>"
      const noHtml = s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
      const m = noHtml.match(/(\d[\d\s]*)(?:[.,](\d+))?/);

      if (m) {
        const intPart = m[1].replace(/\s/g, "");
        const decPart = m[2] ? "." + m[2] : "";
        const num = Number(intPart + decPart);
        if (!Number.isNaN(num)) return num;
      }
    }
  }

  return null;
}

export function formatPriceRu(p: any): string {
  const num = getPriceNumber(p);
  if (num == null) return "Цена по запросу";
  return num.toLocaleString("ru-RU") + " ₽";
}
