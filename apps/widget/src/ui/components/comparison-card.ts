import type { WidgetConfig, ComparisonCard } from "../../config.js";

interface ComparisonCardOptions {
  config: WidgetConfig;
  comparison: ComparisonCard;
  onSelect: (productId: string) => void;
}

export function renderComparisonCard(opts: ComparisonCardOptions): HTMLDivElement {
  const { config, comparison, onSelect } = opts;
  const [a, b] = comparison.products;

  const container = document.createElement("div");
  container.setAttribute(
    "style",
    "background:#fff;border-radius:12px;border:1px solid #f0f0f0;overflow:hidden;animation:sa-slideUp 0.3s ease-out;",
  );

  // Side by side product headers
  const grid = document.createElement("div");
  grid.setAttribute("style", "display:grid;grid-template-columns:1fr 1fr;gap:0;");

  [a, b].forEach((product, idx) => {
    const cell = document.createElement("div");
    cell.setAttribute(
      "style",
      `padding:12px;${idx === 0 ? "border-right:1px solid #f0f0f0;" : ""}text-align:center;`,
    );

    const imgWrap = document.createElement("div");
    imgWrap.setAttribute(
      "style",
      "width:100%;padding-top:80%;position:relative;background:#f9fafb;border-radius:8px;overflow:hidden;margin-bottom:8px;",
    );

    const img = document.createElement("img");
    img.src = product.image_url;
    img.alt = product.title;
    img.setAttribute(
      "style",
      "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;",
    );
    imgWrap.appendChild(img);

    if (comparison.recommendation?.product_id === product.product_id) {
      const badge = document.createElement("span");
      badge.setAttribute(
        "style",
        "position:absolute;top:6px;right:6px;background:#22c55e;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;",
      );
      badge.textContent = "Recommended";
      imgWrap.appendChild(badge);
    }
    cell.appendChild(imgWrap);

    const titleEl = document.createElement("div");
    titleEl.setAttribute(
      "style",
      "font-size:12px;font-weight:600;color:#111;line-height:1.3;",
    );
    titleEl.textContent = product.title;
    cell.appendChild(titleEl);

    const priceEl = document.createElement("div");
    priceEl.setAttribute(
      "style",
      `font-size:16px;font-weight:700;color:var(--ava-accent,${config.accentColor});margin-top:4px;`,
    );
    priceEl.textContent = `$${product.price.toFixed(2)}`;
    cell.appendChild(priceEl);

    grid.appendChild(cell);
  });
  container.appendChild(grid);

  // Differing attributes
  if (comparison.differing_attributes.length > 0) {
    const attrsWrap = document.createElement("div");
    attrsWrap.setAttribute("style", "border-top:1px solid #f0f0f0;");

    comparison.differing_attributes.forEach((attr, idx) => {
      const row = document.createElement("div");
      row.setAttribute(
        "style",
        `display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 12px;${idx < comparison.differing_attributes.length - 1 ? "border-bottom:1px solid #f8f8f8;" : ""}font-size:12px;`,
      );

      const val1 = document.createElement("span");
      val1.setAttribute("style", "text-align:center;color:#374151;");
      val1.textContent = attr.values[0];

      const label = document.createElement("span");
      label.setAttribute(
        "style",
        "color:#9ca3af;font-size:10px;font-weight:600;background:#f3f4f6;padding:2px 8px;border-radius:4px;",
      );
      label.textContent = attr.label;

      const val2 = document.createElement("span");
      val2.setAttribute("style", "text-align:center;color:#374151;");
      val2.textContent = attr.values[1];

      row.appendChild(val1);
      row.appendChild(label);
      row.appendChild(val2);
      attrsWrap.appendChild(row);
    });
    container.appendChild(attrsWrap);
  }

  // Action buttons
  const actionsWrap = document.createElement("div");
  actionsWrap.setAttribute(
    "style",
    "display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border-top:1px solid #f0f0f0;",
  );

  [a, b].forEach((product) => {
    const btn = document.createElement("button");
    const isRecommended =
      comparison.recommendation?.product_id === product.product_id;
    btn.setAttribute(
      "style",
      `background:${isRecommended ? `var(--ava-primary,${config.brandColor})` : "#f3f4f6"};color:${isRecommended ? "#fff" : "#374151"};border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ava-font,${config.fontFamily});transition:all 0.2s ease;`,
    );
    btn.textContent = "Choose This";
    btn.addEventListener("click", () => onSelect(product.product_id));
    actionsWrap.appendChild(btn);
  });
  container.appendChild(actionsWrap);

  // Recommendation reason
  if (comparison.recommendation?.reason) {
    const reason = document.createElement("div");
    reason.setAttribute(
      "style",
      "padding:8px 12px;background:#f0fdf4;font-size:11px;color:#166534;text-align:center;border-top:1px solid #bbf7d0;",
    );
    reason.textContent = `\uD83D\uDCA1 ${comparison.recommendation.reason}`;
    container.appendChild(reason);
  }

  return container;
}
