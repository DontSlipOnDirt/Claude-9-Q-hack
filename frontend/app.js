const SESSION_KEY = "picnic_customer_id";

/**
 * Custom “Try new” recommendations (e.g. purchase history, ML model):
 *   window.getPicnicTryNewSuggestion = async (ctx) => recipe | null
 * ctx: { customerId, dayIndex, mealIndex, mealType, slots, recommendedRecipes, catalogRecipes }
 * Return { id, name, ... } or null to use the built-in default (prefs-based list + catalog).
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODAY_IDX = 1;

const MEAL_TYPES = ["breakfast", "lunch", "dinner"];

const EMOJIS = [
  "🍳", "🥗", "🍝", "🍌", "🥪", "🍗", "🥞", "🍜", "🥦", "🍓", "🌮", "🐟", "🥚", "🥙", "🍕", "🧇", "🍱", "🥩", "🍞", "🥘", "🫕",
];

async function apiJson(url, options) {
  const r = await fetch(url, options);
  let data = {};
  try {
    data = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const msg =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg || d).join("; ")
          : r.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

const api = {
  login: (email, password) =>
    apiJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  register: (body) =>
    apiJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  customer: (id) => apiJson(`/api/customers/${id}`),
  tags: () => apiJson("/api/tags"),
  deliveries: () => apiJson("/api/deliveries"),
  articles: () => apiJson("/api/catalog/articles"),
  recipes: () => apiJson("/api/catalog/recipes"),
  ordersByCustomer: (customerId) =>
    apiJson(`/api/customers/${customerId}/orders`),
  customerPrefs: (customerId) =>
    apiJson(`/api/customers/${customerId}/preferences`),
  savePrefs: (customerId, payload) =>
    apiJson(`/api/customers/${customerId}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  recommendations: (customerId) =>
    apiJson(`/api/recommendations/${customerId}`),
  createOrder: (payload) =>
    apiJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  shoppingFromMeals: (meals) =>
    apiJson("/api/catalog/shopping-from-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meals }),
    }),
};

const state = {
  currentCustomer: null,
  selectedCustomer: null,
  tags: [],
  deliveries: [],
  articles: [],
  recipes: [],
  /** Ingredient lines from planned meals (API) */
  plannerBasketDetail: [],
  /** Manual catalog adds (not from meal plan) */
  extras: [],
  selectedTagIds: new Set(),
  /** 7×3: each cell is null (empty) or { emoji, name, type, price, badge, recipeId } */
  slots: [],
  /** Last /api/recommendations recommended_recipes — used by default Try new */
  recommendedRecipes: [],
  /** Avoid resetting the week when the same customer refreshes */
  plannerCustomerId: null,
  /** { di, mi } while recipe modal is open */
  recipePickTarget: null,
  /** Only slots with true are included in basket + footer total (opt-in). */
  inBasket: {},
  weekOffset: 0,
  appNav: "planner",
};

function pickBadgeFromRecipe(recipe) {
  const t = `${recipe.name} ${recipe.description || ""}`.toLowerCase();
  if (t.includes("vegan") || t.includes("tofu") || t.includes("lentil")) return "vegan";
  if (t.includes("salad") || t.includes("chicken") || t.includes("fish")) return "lowcarb";
  if (t.includes("fresh") || t.includes("green")) return "seasonal";
  return "";
}

function estimateRecipePrice(recipe) {
  const base = 2.5 + (recipe.match_score || 0) * 0.8;
  return Math.min(12, Math.round(base * 10) / 10);
}

function initEmptyPlannerSlots() {
  state.slots = [];
  for (let d = 0; d < 7; d++) {
    state.slots.push([null, null, null]);
  }
}

function assignRecipeToSlot(di, mi, recipe) {
  state.slots[di][mi] = {
    emoji: EMOJIS[(di * 3 + mi) % EMOJIS.length],
    name: recipe.name,
    type: MEAL_TYPES[mi],
    price: estimateRecipePrice(recipe),
    badge: pickBadgeFromRecipe(recipe),
    recipeId: recipe.id,
  };
}

/**
 * Teammate hook: set `window.getPicnicTryNewSuggestion = async (ctx) => recipe | null`
 * ctx: { customerId, dayIndex, mealIndex, mealType, slots, recommendedRecipes, catalogRecipes }
 * Return a recipe object with at least { id, name } or null to fall back to built-in logic.
 */
async function tryNewForSlot(di, mi) {
  if (typeof window.getPicnicTryNewSuggestion === "function") {
    try {
      const recipe = await window.getPicnicTryNewSuggestion({
        customerId: state.selectedCustomer,
        dayIndex: di,
        mealIndex: mi,
        mealType: MEAL_TYPES[mi],
        slots: state.slots,
        recommendedRecipes: state.recommendedRecipes,
        catalogRecipes: state.recipes,
      });
      if (recipe && recipe.id) {
        assignRecipeToSlot(di, mi, recipe);
        buildGrid();
        syncPlannerBasket().catch(console.error);
        return;
      }
    } catch (err) {
      console.error("getPicnicTryNewSuggestion failed:", err);
    }
  }
  await defaultTryNewForSlot(di, mi);
  buildGrid();
  syncPlannerBasket().catch(console.error);
}

function collectUsedRecipeIds() {
  const used = new Set();
  for (let d = 0; d < 7; d++) {
    for (let m = 0; m < 3; m++) {
      const s = state.slots[d][m];
      if (s?.recipeId) used.add(s.recipeId);
    }
  }
  return used;
}

/** Stand-in until the teammate model is wired: prefer prefs-based recommendations, else catalog. */
async function defaultTryNewForSlot(di, mi) {
  const used = collectUsedRecipeIds();
  let pool = (state.recommendedRecipes || []).filter((r) => r && r.id && !used.has(r.id));
  if (!pool.length) pool = (state.recipes || []).filter((r) => r && r.id && !used.has(r.id));
  if (!pool.length) pool = (state.recipes || []).filter((r) => r && r.id);
  if (!pool.length) return;
  const pick = pool[(di * 3 + mi) % pool.length];
  assignRecipeToSlot(di, mi, pick);
}

function parseSlotKey(key) {
  const [di, mi] = key.split("-").map(Number);
  return { di, mi };
}

function openRecipePicker(di, mi) {
  state.recipePickTarget = { di, mi };
  const mt = MEAL_TYPES[mi];
  document.getElementById("recipePickSubtitle").textContent =
    `Choose a recipe for ${ABBRS[di]} · ${mt.charAt(0).toUpperCase() + mt.slice(1)}.`;
  const ul = document.getElementById("recipePickList");
  const list = state.recipes || [];
  if (!list.length) {
    ul.innerHTML = `<li class="recipe-pick-empty">No recipes loaded yet.</li>`;
  } else {
    ul.innerHTML = list
      .map(
        (r) => `
      <li>
        <button type="button" class="recipe-pick-item" data-pick-recipe-id="${escapeAttr(r.id)}">
          <span class="recipe-pick-name">${escapeHtml(r.name)}</span>
          <span class="recipe-pick-chev">→</span>
        </button>
      </li>`
      )
      .join("");
  }
  document.getElementById("recipePickModal").classList.remove("hidden");
}

function closeRecipePicker() {
  document.getElementById("recipePickModal").classList.add("hidden");
  state.recipePickTarget = null;
}

function badgeHTML(b) {
  if (b === "seasonal") return '<span class="badge badge-seasonal">Seasonal</span>';
  if (b === "vegan") return '<span class="badge badge-vegan">Vegan</span>';
  if (b === "lowcarb") return '<span class="badge badge-lowcarb">Low carb</span>';
  return "";
}

const PLANNER_HEADER_ROW = 1;
const PLANNER_FIRST_DAY_ROW = 2;

/** Lock header cells to columns so filtering with display:none does not reflow the grid. */
function layoutPlannerHeaderCells() {
  const grid = document.getElementById("planner-grid");
  const heads = grid.querySelectorAll(":scope > .col-head");
  heads.forEach((el, i) => {
    el.style.gridRow = String(PLANNER_HEADER_ROW);
    el.style.gridColumn = String(i + 1);
  });
}

function buildGrid() {
  const grid = document.getElementById("planner-grid");
  grid.querySelectorAll(".row-el").forEach((el) => el.remove());
  layoutPlannerHeaderCells();

  DAYS.forEach((day, di) => {
    const lbl = document.createElement("div");
    lbl.className = "day-label row-el" + (di === TODAY_IDX ? " today" : "");
    lbl.innerHTML = `<span class="day-name">${ABBRS[di]}</span><span class="day-full">${day}</span>`;
    const dataRow = PLANNER_FIRST_DAY_ROW + di;
    lbl.style.gridRow = String(dataRow);
    lbl.style.gridColumn = "1";
    grid.appendChild(lbl);

    MEAL_TYPES.forEach((mealType, mi) => {
      const m = state.slots[di][mi];
      const cell = document.createElement("div");
      cell.className = "meal-cell row-el";
      cell.dataset.type = mealType;
      cell.style.gridRow = String(dataRow);
      cell.style.gridColumn = String(mi + 2);
      const key = `${di}-${mi}`;

      if (!m) {
        cell.innerHTML = `<div class="meal-slot-empty">
          <span class="slot-empty-type">${mealType.charAt(0).toUpperCase() + mealType.slice(1)}</span>
          <div class="slot-empty-actions">
            <button type="button" class="slot-btn slot-btn-primary" data-add-item="${key}">Add item</button>
            <button type="button" class="slot-btn slot-btn-ghost" data-try-new="${key}">Try new</button>
          </div>
        </div>`;
      } else {
        const inB = Boolean(state.inBasket[key]);
        cell.innerHTML = `<div class="meal-card${inB ? " meal-card--in-basket" : ""}">
          <div class="meal-thumb"><span>${m.emoji}</span>
            <button type="button" class="del-btn" data-clear-slot="${key}" aria-label="Clear slot">
              <svg viewBox="0 0 8 8" fill="none"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="#E61E14" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="meal-body">
            <div class="meal-meta">
              <span class="meal-type-tag">${m.type.charAt(0).toUpperCase() + m.type.slice(1)}</span>${badgeHTML(m.badge)}
            </div>
            <div class="meal-name">${escapeHtml(m.name)}</div>
            <div class="meal-price">Est. €${m.price.toFixed(2)}</div>
            <button type="button" class="meal-basket-toggle${inB ? " is-on" : ""}" data-basket-toggle="${key}" aria-pressed="${inB}">
              ${inB ? "✓ In basket" : "+ Add to basket"}
            </button>
          </div></div>`;
      }
      grid.appendChild(cell);
    });
  });

  applyMealFilters();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyMealFilters() {
  const active = [...document.querySelectorAll(".meal-filter.meal-on")].map(
    (c) => c.dataset.meal
  );
  const show = (mealType) => active.includes(mealType);
  document.querySelectorAll(".meal-cell").forEach((cell) => {
    const hidden = !show(cell.dataset.type);
    cell.dataset.hidden = String(hidden);
    cell.style.display = hidden ? "none" : "";
  });
  document.querySelectorAll(".col-head[data-meal-head]").forEach((h) => {
    const mt = h.dataset.mealHead;
    const hidden = !show(mt);
    h.dataset.hidden = String(hidden);
    h.style.display = hidden ? "none" : "";
  });
}

function slotMealLabel(di, mi, slot) {
  const mt = MEAL_TYPES[mi];
  const mtTitle = mt.charAt(0).toUpperCase() + mt.slice(1);
  return `${ABBRS[di]} · ${mtTitle} · ${slot.name}`;
}

/** Filled slots explicitly added to basket → API meal slots */
function plannerMealsPayload() {
  const meals = [];
  for (let di = 0; di < 7; di++) {
    for (let mi = 0; mi < 3; mi++) {
      const key = `${di}-${mi}`;
      if (!state.inBasket[key]) continue;
      const slot = state.slots[di]?.[mi];
      if (!slot?.recipeId) continue;
      meals.push({
        recipe_id: slot.recipeId,
        label: slotMealLabel(di, mi, slot),
      });
    }
  }
  return meals;
}

function mergeForCheckout() {
  const map = new Map();
  for (const row of state.plannerBasketDetail) {
    const sku = row.sku;
    const q = Number(row.quantity) || 0;
    map.set(sku, (map.get(sku) || 0) + q);
  }
  for (const x of state.extras) {
    map.set(x.sku, (map.get(x.sku) || 0) + (Number(x.quantity) || 0));
  }
  return [...map.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

function updateFooterTotal() {
  let cents = 0;
  for (const row of state.plannerBasketDetail) {
    cents += Math.round(Number(row.line_total) * 100);
  }
  for (const x of state.extras) {
    cents += Math.round(Number(x.price) * Number(x.quantity) * 100);
  }
  const el = document.getElementById("total-display");
  if (el) el.textContent = "€" + (cents / 100).toFixed(2);
}

async function syncPlannerBasket() {
  const meals = plannerMealsPayload();
  if (!meals.length) {
    state.plannerBasketDetail = [];
    renderCart();
    return;
  }
  try {
    const data = await api.shoppingFromMeals(meals);
    state.plannerBasketDetail = Array.isArray(data.detail) ? data.detail : [];
  } catch (err) {
    console.error(err);
    state.plannerBasketDetail = [];
  }
  renderCart();
}

function setAuthMessage(text, isError) {
  const el = document.getElementById("authMessage");
  el.textContent = text || "";
  el.classList.toggle("is-error", Boolean(isError));
}

function showAuth() {
  document.getElementById("auth-gate").classList.remove("hidden");
  document.getElementById("app-root").classList.add("hidden");
  state.currentCustomer = null;
  state.selectedCustomer = null;
  state.plannerCustomerId = null;
}

function setAvatarInitials(name) {
  const el = document.getElementById("userAvatar");
  const parts = (name || "?").trim().split(/\s+/);
  const a = (parts[0]?.[0] || "?").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  el.textContent = (a + b).slice(0, 2);
}

async function enterApp(customer) {
  localStorage.setItem(SESSION_KEY, customer.id);
  state.currentCustomer = customer;
  state.selectedCustomer = customer.id;
  setAvatarInitials(customer.name);
  document.getElementById("auth-gate").classList.add("hidden");
  document.getElementById("app-root").classList.remove("hidden");
  setAuthMessage("");
  await loadAppData();
}

function switchAppNav(nav) {
  state.appNav = nav;
  document.querySelectorAll(".topnav a[data-app-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.appNav === nav);
  });
  const chrome = document.getElementById("planner-chrome");
  const itemsPanel = document.getElementById("panel-items");
  const basket = document.getElementById("panel-basket");
  const history = document.getElementById("panel-history");
  const showPlanner = nav === "planner";
  chrome.classList.toggle("hidden", !showPlanner);
  itemsPanel.classList.toggle("hidden", nav !== "items");
  basket.classList.toggle("hidden", nav !== "basket");
  history.classList.toggle("hidden", nav !== "history");
  if (nav === "history") renderOrders();
}

function renderTags() {
  const el = document.getElementById("tagChecklist");
  el.innerHTML = state.tags
    .map(
      (tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${tag.id}" ${state.selectedTagIds.has(tag.id) ? "checked" : ""} />
        ${escapeHtml(tag.name)}
      </label>
    `
    )
    .join("");
}

function formatCookTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!m) return iso;
  const parts = [];
  if (m[1]) parts.push(`${m[1]}h`);
  if (m[2]) parts.push(`${m[2]} min`);
  if (m[3]) parts.push(`${m[3]}s`);
  return parts.length ? parts.join(" ") : iso;
}

function productCardHTML(a) {
  return `
      <div class="product-card">
        <h4>${escapeHtml(a.name)}</h4>
        <p class="product-card-price">€${Number(a.price).toFixed(2)}</p>
        <button type="button" class="checkout-btn add-cart-btn" data-sku="${escapeAttr(a.sku)}" data-name="${escapeAttr(a.name)}" data-price="${a.price}">Add to basket</button>
      </div>`;
}

function recipeBrowseCardHTML(r) {
  const meta = [];
  if (r.portion_quantity != null && r.portion_quantity !== "")
    meta.push(`${r.portion_quantity} portions`);
  const ct = formatCookTime(r.cook_time);
  if (ct) meta.push(ct);
  const desc = r.description || "";
  const short =
    desc.length > 140 ? `${desc.slice(0, 140).trim()}…` : desc;
  return `
      <div class="recipe-browse-card">
        <h4>${escapeHtml(r.name)}</h4>
        <p class="recipe-browse-meta">${escapeHtml(meta.join(" · ") || "Recipe")}</p>
        <p class="recipe-browse-desc">${escapeHtml(short)}</p>
        <p class="recipe-browse-hint">Plan via <strong>This week</strong> — recipes are not sold as single SKUs.</p>
      </div>`;
}

function categoryIdSlug(category) {
  return String(category)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "other";
}

function groupArticlesByCategory(articles) {
  const map = new Map();
  for (const a of articles) {
    const cat = (a.category && String(a.category).trim()) || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(a);
  }
  return [...map.entries()].sort((x, y) => x[0].localeCompare(y[0]));
}

/** Renders shop categories + Recipes subsection; optional search filters both. */
function renderItemsPanel(searchQuery = "") {
  const el = document.getElementById("itemsGrid");
  const q = searchQuery.trim().toLowerCase();
  let articles = state.articles;
  let recipes = state.recipes;
  if (q) {
    articles = articles.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.category && a.category.toLowerCase().includes(q)) ||
        (a.sku && String(a.sku).toLowerCase().includes(q))
    );
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }
  const parts = [];
  const groups = groupArticlesByCategory(articles);
  for (const [category, list] of groups) {
    if (!list.length) continue;
    const cid = categoryIdSlug(category);
    parts.push(`<section class="shop-category" aria-labelledby="heading-${cid}">`);
    parts.push(
      `<h3 class="shop-category-title" id="heading-${cid}">${escapeHtml(category)}</h3>`
    );
    parts.push(`<div class="product-grid shop-category-grid">`);
    parts.push(list.map((a) => productCardHTML(a)).join(""));
    parts.push(`</div></section>`);
  }
  if (recipes.length) {
    parts.push(`<section class="shop-category shop-category--recipes" aria-labelledby="heading-recipes">`);
    parts.push(`<h3 class="shop-category-title" id="heading-recipes">Recipes</h3>`);
    parts.push(`<div class="recipe-browse-grid">`);
    parts.push(recipes.map((r) => recipeBrowseCardHTML(r)).join(""));
    parts.push(`</div></section>`);
  }
  if (!parts.length) {
    el.innerHTML = `<p class="panel-desc">No items match your search.</p>`;
    return;
  }
  el.innerHTML = parts.join("");
}

function renderCart() {
  const el = document.getElementById("cartList");
  const hasPlanner = state.plannerBasketDetail.length > 0;
  const hasExtras = state.extras.length > 0;
  if (!hasPlanner && !hasExtras) {
    el.innerHTML = `<p class="panel-desc">Your basket is empty. On <strong>This week</strong>, use <strong>Add to basket</strong> on a meal to load its recipe ingredients and update the total below. Add extras from <strong>Items</strong>.</p>`;
    updateFooterTotal();
    return;
  }
  const parts = [];
  if (hasPlanner) {
    const order = [];
    const byLabel = new Map();
    for (const row of state.plannerBasketDetail) {
      const lab = row.meal_label || "Planned meals";
      if (!byLabel.has(lab)) {
        byLabel.set(lab, []);
        order.push(lab);
      }
      byLabel.get(lab).push(row);
    }
    for (const lab of order) {
      const rows = byLabel.get(lab);
      const recipeName = rows[0]?.recipe_name || "Meal";
      let subtotal = 0;
      for (const r of rows) subtotal += Number(r.line_total) || 0;
      parts.push(`<div class="basket-meal-group">`);
      parts.push(`<h3 class="basket-meal-title">${escapeHtml(recipeName)}</h3>`);
      parts.push(`<p class="basket-meal-slot">${escapeHtml(lab)}</p>`);
      for (const row of rows) {
        const unit = Number(row.unit_price);
        const qty = Number(row.quantity);
        const line = Number(row.line_total);
        parts.push(`
      <div class="basket-row basket-ingredient-row">
        <div>
          <h4>${escapeHtml(row.ingredient_name)}</h4>
          <p class="basket-subline">${escapeHtml(row.article_name)} · ${escapeHtml(row.sku)}</p>
        </div>
        <div class="basket-ingredient-meta">
          <span class="basket-price-line">€${unit.toFixed(2)} × ${qty}</span>
          <strong class="basket-line-total">€${line.toFixed(2)}</strong>
        </div>
      </div>`);
      }
      parts.push(
        `<div class="basket-meal-subtotal"><span>Meal total</span><strong>€${subtotal.toFixed(2)}</strong></div></div>`
      );
    }
  }
  if (hasExtras) {
    parts.push(`<h3 class="basket-section-title">From shop</h3>`);
    state.extras.forEach((c, idx) => {
      parts.push(`
      <div class="basket-row">
        <div>
          <h4>${escapeHtml(c.name)}</h4>
          <p>${escapeHtml(c.sku)} × ${c.quantity}</p>
        </div>
        <div>
          <strong>€${(Number(c.price) * c.quantity).toFixed(2)}</strong>
          <button type="button" class="week-shift-btn remove-extra-btn" data-extra-index="${idx}">Remove</button>
        </div>
      </div>`);
    });
  }
  el.innerHTML = parts.join("");
  updateFooterTotal();
}

async function renderOrders() {
  const el = document.getElementById("ordersList");
  const orders = await api.ordersByCustomer(state.selectedCustomer);
  if (!orders.length) {
    el.innerHTML = `<p class="panel-desc">No orders yet.</p>`;
    return;
  }
  el.innerHTML = orders
    .map(
      (o) => `
      <div class="basket-row">
        <div>
          <h4>${escapeHtml(o.status.toUpperCase())}</h4>
          <p>${escapeHtml(o.creation_date)} · ${escapeHtml(o.timeslot || "")}</p>
        </div>
        <strong>€${Number(o.total_price).toFixed(2)}</strong>
      </div>
    `
    )
    .join("");
}

async function loadAppData() {
  const [tags, deliveries, articles, recipes, recData] = await Promise.all([
    api.tags(),
    api.deliveries(),
    api.articles(),
    api.recipes(),
    api.recommendations(state.selectedCustomer),
  ]);
  state.tags = tags;
  state.deliveries = deliveries;
  state.articles = articles;
  state.recipes = recipes;
  state.extras = [];
  state.recommendedRecipes = recData.recommended_recipes || [];
  if (state.plannerCustomerId !== state.selectedCustomer) {
    initEmptyPlannerSlots();
    state.inBasket = {};
    state.plannerCustomerId = state.selectedCustomer;
  }

  const prefs = await api.customerPrefs(state.selectedCustomer);
  state.selectedTagIds = new Set(prefs.map((p) => p.tag_id));
  renderTags();

  buildGrid();

  renderItemsPanel();
  await syncPlannerBasket();
  await renderOrders();

  document.getElementById("deliverySelect").innerHTML = state.deliveries
    .map(
      (d) =>
        `<option value="${escapeHtml(d.id)}">${escapeHtml(d.timeslot)} (${escapeHtml(d.hub_id)})</option>`
    )
    .join("");

  document.getElementById("orderResult").textContent = "No order yet.";
  switchAppNav("planner");
}

function toggleAI() {
  const p = document.getElementById("ai-panel");
  const b = document.getElementById("ai-toggle");
  const open = p.classList.toggle("open");
  b.classList.toggle("open", open);
}

function handlePreset(text) {
  window.alert(
    `AI assistant:\n\n"${text}"\n\n(Hook this to your recommendation backend when ready.)`
  );
}

function shiftWeek(dir) {
  state.weekOffset += dir;
  const d = new Date(2026, 3, 7);
  d.setDate(d.getDate() + state.weekOffset * 7);
  document.getElementById("week-label").textContent =
    "Week of " +
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
}

async function placeOrder() {
  const lines = mergeForCheckout();
  if (!lines.length) {
    document.getElementById("orderResult").textContent =
      "Plan meals or add shop products to your basket first.";
    switchAppNav("basket");
    return;
  }
  const seen = new Set();
  const recipe_ids = [];
  for (const m of plannerMealsPayload()) {
    if (!seen.has(m.recipe_id)) {
      seen.add(m.recipe_id);
      recipe_ids.push(m.recipe_id);
    }
  }
  const payload = {
    customer_id: state.selectedCustomer,
    delivery_id: document.getElementById("deliverySelect").value,
    status: "paid",
    creation_date: new Date().toISOString(),
    recipe_ids: recipe_ids.length
      ? recipe_ids
      : state.recipes.slice(0, 1).map((r) => r.id),
    lines,
  };
  const order = await api.createOrder(payload);
  document.getElementById("orderResult").textContent = JSON.stringify(
    order,
    null,
    2
  );
  state.extras = [];
  state.inBasket = {};
  initEmptyPlannerSlots();
  await syncPlannerBasket();
  buildGrid();
  await renderOrders();
  switchAppNav("history");
}

/* Event wiring */
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.authTab;
    document.querySelectorAll(".auth-tab").forEach((t) => {
      t.classList.toggle("is-active", t === tab);
    });
    document.getElementById("form-login").classList.toggle("hidden", mode !== "login");
    document.getElementById("form-register").classList.toggle("hidden", mode !== "register");
    setAuthMessage("");
  });
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  setAuthMessage("Signing in…");
  try {
    const { customer } = await api.login(email, password);
    await enterApp(customer);
  } catch (err) {
    setAuthMessage(err.message || "Login failed", true);
  }
});

document.getElementById("form-register").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  setAuthMessage("Creating account…");
  try {
    const { customer } = await api.register({ name, email, password });
    await enterApp(customer);
  } catch (err) {
    setAuthMessage(err.message || "Registration failed", true);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(SESSION_KEY);
  showAuth();
});

document.getElementById("logo-home").addEventListener("click", (e) => {
  e.preventDefault();
  switchAppNav("planner");
});

document.querySelectorAll(".topnav a[data-app-nav]").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    switchAppNav(a.dataset.appNav);
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  loadAppData().catch(console.error);
});

document.getElementById("ai-toggle").addEventListener("click", toggleAI);

document.querySelectorAll(".preset-pill").forEach((btn) => {
  btn.addEventListener("click", () =>
    handlePreset(btn.getAttribute("data-preset") || "")
  );
});

document.getElementById("ai-send").addEventListener("click", () => {
  const i = document.getElementById("ai-input");
  const v = i.value.trim();
  if (v) {
    handlePreset(v);
    i.value = "";
  }
});

document.getElementById("ai-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("ai-send").click();
  }
});

document.getElementById("week-prev").addEventListener("click", () => shiftWeek(-1));
document.getElementById("week-next").addEventListener("click", () => shiftWeek(1));

document.getElementById("planner-grid").addEventListener("click", (e) => {
  const t = e.target;
  const clearBtn = t.closest?.("[data-clear-slot]");
  if (clearBtn) {
    const key = clearBtn.getAttribute("data-clear-slot");
    const { di, mi } = parseSlotKey(key);
    state.slots[di][mi] = null;
    delete state.inBasket[key];
    buildGrid();
    syncPlannerBasket().catch(console.error);
    return;
  }
  const basketBtn = t.closest?.("[data-basket-toggle]");
  if (basketBtn) {
    const key = basketBtn.getAttribute("data-basket-toggle");
    state.inBasket[key] = !state.inBasket[key];
    buildGrid();
    syncPlannerBasket().catch(console.error);
    return;
  }
  const addItem = t.closest?.("[data-add-item]");
  if (addItem) {
    const key = addItem.getAttribute("data-add-item");
    const { di, mi } = parseSlotKey(key);
    openRecipePicker(di, mi);
    return;
  }
  const tryNew = t.closest?.("[data-try-new]");
  if (tryNew) {
    const key = tryNew.getAttribute("data-try-new");
    const { di, mi } = parseSlotKey(key);
    tryNewForSlot(di, mi).catch(console.error);
  }
});

document.querySelectorAll(".meal-filter").forEach((el) => {
  el.addEventListener("click", () => {
    el.classList.toggle("meal-on");
    applyMealFilters();
  });
});

document.querySelectorAll(".style-filter").forEach((el) => {
  el.addEventListener("click", () => {
    const cls = el.dataset.cls;
    if (cls) el.classList.toggle(cls);
  });
});

document.getElementById("tagChecklist").addEventListener("change", (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.checked) state.selectedTagIds.add(input.value);
  else state.selectedTagIds.delete(input.value);
});

document.getElementById("savePrefsBtn").addEventListener("click", async () => {
  const now = new Date().toISOString();
  const payload = [...state.selectedTagIds].map((tagId) => ({
    tag_id: tagId,
    preference_level: "prefer",
    source: "manual_update",
    created_at: now,
  }));
  await api.savePrefs(state.selectedCustomer, payload);
  const ss = document.getElementById("saveState");
  ss.textContent = "Saved";
  const recData = await api.recommendations(state.selectedCustomer);
  state.recommendedRecipes = recData.recommended_recipes || [];
  buildGrid();
  syncPlannerBasket().catch(console.error);
  setTimeout(() => {
    ss.textContent = "";
  }, 2000);
});

document.getElementById("itemsSearch").addEventListener("input", () => {
  renderItemsPanel(document.getElementById("itemsSearch").value);
});

document.getElementById("itemsGrid").addEventListener("click", (e) => {
  const btn = e.target.closest?.(".add-cart-btn");
  if (!btn) return;
  const sku = btn.dataset.sku;
  const name = btn.dataset.name;
  const price = Number(btn.dataset.price);
  const existing = state.extras.find((i) => i.sku === sku);
  if (existing) existing.quantity += 1;
  else state.extras.push({ sku, name, price, quantity: 1 });
  renderCart();
});

document.getElementById("cartList").addEventListener("click", (e) => {
  const btn = e.target.closest?.(".remove-extra-btn");
  if (!btn) return;
  state.extras.splice(Number(btn.dataset.extraIndex), 1);
  renderCart();
});

document.getElementById("createOrderBtn").addEventListener("click", () => {
  placeOrder().catch((err) => {
    document.getElementById("orderResult").textContent = err.message;
  });
});

document.getElementById("footer-checkout").addEventListener("click", () => {
  if (!mergeForCheckout().length) {
    switchAppNav("basket");
    document.getElementById("orderResult").textContent =
      "Plan meals or add shop items, then place your order.";
    return;
  }
  placeOrder().catch((err) => {
    document.getElementById("orderResult").textContent = err.message;
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("recipePickModal").classList.contains("hidden")) {
    closeRecipePicker();
  }
});

document.getElementById("recipePickModal").addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("[data-close-modal]") || t.classList.contains("modal-backdrop")) {
    closeRecipePicker();
    return;
  }
  const pick = t.closest?.("[data-pick-recipe-id]");
  if (pick && state.recipePickTarget) {
    const id = pick.getAttribute("data-pick-recipe-id");
    const recipe = state.recipes.find((r) => r.id === id);
    if (recipe) {
      assignRecipeToSlot(state.recipePickTarget.di, state.recipePickTarget.mi, recipe);
      closeRecipePicker();
      buildGrid();
      syncPlannerBasket().catch(console.error);
    }
  }
});

async function bootstrap() {
  const id = localStorage.getItem(SESSION_KEY);
  if (id) {
    try {
      const customer = await api.customer(id);
      await enterApp(customer);
      return;
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }
  showAuth();
}

bootstrap().catch((err) => {
  console.error(err);
  setAuthMessage(`Could not start: ${err.message}`, true);
});
