import type { WidgetConfig, ProductCard } from "../../config.js";

interface ProductCardOptions {
  config: WidgetConfig;
  card: ProductCard;
  index: number;
  onAddToCart: (productId: string) => void;
  /** Micro-signal: user wants more recommendations like this */
  onMoreLikeThis?: (productId: string) => void;
}

export function renderProductCard(opts: ProductCardOptions): HTMLDivElement {
  const { config, card, index, onAddToCart, onMoreLikeThis } = opts;
  const hasDiscount = card.original_price && card.original_price > card.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((card.original_price! - card.price) / card.original_price!) * 100,
      )
    : 0;

  const container = document.createElement("div");
  container.setAttribute(
    "style",
    `background:#fff;border-radius:14px;border:1px solid #f0f0f0;overflow:hidden;
     animation:sa-slideUp 0.3s ease-out ${index * 0.08}s both;
     cursor:pointer;transition:box-shadow 0.2s ease,transform 0.2s ease;`,
  );
  container.addEventListener("mouseenter", () => {
    container.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
    container.style.transform = "translateY(-2px)";
  });
  container.addEventListener("mouseleave", () => {
    container.style.boxShadow = "none";
    container.style.transform = "translateY(0)";
  });

  // --- Image wrapper ---
  const imgWrap = document.createElement("div");
  imgWrap.setAttribute(
    "style",
    "position:relative;padding-top:72%;background:#f9fafb;overflow:hidden;",
  );

  const img = document.createElement("img");
  img.src = card.image_url;
  img.alt = card.title;
  img.loading = "lazy";
  img.setAttribute(
    "style",
    "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease;",
  );
  container.addEventListener("mouseenter", () => { img.style.transform = "scale(1.03)"; });
  container.addEventListener("mouseleave", () => { img.style.transform = "scale(1)"; });
  imgWrap.appendChild(img);

  if (hasDiscount) {
    const badge = document.createElement("span");
    badge.setAttribute(
      "style",
      `position:absolute;top:8px;left:8px;background:${config.accentColor};
       color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;`,
    );
    badge.textContent = `-${discountPct}%`;
    imgWrap.appendChild(badge);
  }

  if (card.differentiator) {
    const diff = document.createElement("span");
    diff.setAttribute(
      "style",
      `position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.65);
       color:#fff;font-size:10px;font-weight:500;padding:3px 8px;border-radius:6px;
       backdrop-filter:blur(4px);`,
    );
    diff.textContent = card.differentiator;
    imgWrap.appendChild(diff);
  }

  // "More like this" micro-signal — top-right corner overlay
  if (onMoreLikeThis) {
    const moreBtn = document.createElement("button");
    moreBtn.setAttribute(
      "style",
      `position:absolute;top:8px;right:8px;
       background:rgba(255,255,255,0.85);backdrop-filter:blur(6px);
       border:none;border-radius:8px;padding:4px 8px;
       font-size:10px;font-weight:600;color:#374151;cursor:pointer;
       opacity:0;transition:opacity 0.2s ease;font-family:${config.fontFamily};`,
    );
    moreBtn.textContent = "More like this";
    moreBtn.setAttribute("aria-label", "Show more recommendations like this");
    container.addEventListener("mouseenter", () => { moreBtn.style.opacity = "1"; });
    container.addEventListener("mouseleave", () => { moreBtn.style.opacity = "0"; });
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moreBtn.textContent = "✓ Noted";
      moreBtn.style.color = "#22c55e";
      moreBtn.style.opacity = "1";
      setTimeout(() => { if (onMoreLikeThis) onMoreLikeThis(card.product_id); }, 500);
    });
    imgWrap.appendChild(moreBtn);
  }

  container.appendChild(imgWrap);

  // --- Info ---
  const info = document.createElement("div");
  info.setAttribute("style", "padding:10px 12px 12px;");

  const title = document.createElement("div");
  title.setAttribute(
    "style",
    `font-size:13px;font-weight:500;color:#111827;line-height:1.35;
     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px;`,
  );
  title.textContent = card.title;
  info.appendChild(title);

  // Rating
  const ratingWrap = document.createElement("div");
  ratingWrap.setAttribute(
    "style",
    "display:flex;align-items:center;gap:4px;margin-bottom:8px;",
  );
  const stars = document.createElement("span");
  stars.setAttribute("style", "font-size:11px;color:#f59e0b;");
  stars.textContent =
    "\u2605".repeat(Math.round(card.rating)) +
    "\u2606".repeat(5 - Math.round(card.rating));
  const reviewCount = document.createElement("span");
  reviewCount.setAttribute("style", "font-size:11px;color:#9ca3af;");
  reviewCount.textContent = `(${card.review_count})`;
  ratingWrap.appendChild(stars);
  ratingWrap.appendChild(reviewCount);
  info.appendChild(ratingWrap);

  // Price + Add row
  const priceRow = document.createElement("div");
  priceRow.setAttribute(
    "style",
    "display:flex;justify-content:space-between;align-items:center;",
  );

  const priceWrap = document.createElement("div");
  priceWrap.setAttribute("style", "display:flex;align-items:baseline;gap:5px;");

  const price = document.createElement("span");
  price.setAttribute("style", "font-size:16px;font-weight:700;color:#111827;");
  price.textContent = `$${card.price.toFixed(2)}`;
  priceWrap.appendChild(price);

  if (hasDiscount) {
    const origPrice = document.createElement("span");
    origPrice.setAttribute(
      "style",
      "font-size:12px;color:#9ca3af;text-decoration:line-through;",
    );
    origPrice.textContent = `$${card.original_price!.toFixed(2)}`;
    priceWrap.appendChild(origPrice);
  }

  const addBtn = document.createElement("button");
  addBtn.setAttribute(
    "style",
    `background:${config.brandColor};color:#fff;border:none;border-radius:9px;
     padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;
     font-family:${config.fontFamily};
     transition:background 0.15s ease,transform 0.1s ease,opacity 0.15s ease;`,
  );
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addBtn.textContent = "✓ Added";
    addBtn.style.background = "#22c55e";
    addBtn.style.transform = "scale(1)";
    setTimeout(() => {
      addBtn.textContent = "+ Add";
      addBtn.style.background = config.brandColor;
    }, 1800);
    onAddToCart(card.product_id);
  });
  addBtn.addEventListener("mouseenter", () => { addBtn.style.opacity = "0.88"; });
  addBtn.addEventListener("mouseleave", () => { addBtn.style.opacity = "1"; });
  addBtn.addEventListener("mousedown", () => { addBtn.style.transform = "scale(0.95)"; });
  addBtn.addEventListener("mouseup", () => { addBtn.style.transform = "scale(1)"; });

  priceRow.appendChild(priceWrap);
  priceRow.appendChild(addBtn);
  info.appendChild(priceRow);
  container.appendChild(info);

  return container;
}
