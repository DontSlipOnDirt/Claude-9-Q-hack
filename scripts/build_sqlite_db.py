import csv
import hashlib
import secrets
import sqlite3
from pathlib import Path


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return f"{salt}${dk}"


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
DB_PATH = ROOT_DIR / "picnic_data.db"


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS recipe_tags;
        DROP TABLE IF EXISTS article_tags;
        DROP TABLE IF EXISTS customer_preferences;
        DROP TABLE IF EXISTS preference_tags;
        DROP TABLE IF EXISTS ingredient_articles;
        DROP TABLE IF EXISTS article_allergy_labels;
        DROP TABLE IF EXISTS recipe_instructions;
        DROP TABLE IF EXISTS recipe_ingredients;
        DROP TABLE IF EXISTS order_recipes;
        DROP TABLE IF EXISTS orderline_ids;
        DROP TABLE IF EXISTS stock;
        DROP TABLE IF EXISTS orderlines;
        DROP TABLE IF EXISTS orders;
        DROP TABLE IF EXISTS deliveries;
        DROP TABLE IF EXISTS articles;
        DROP TABLE IF EXISTS ingredients;
        DROP TABLE IF EXISTS recipes;
        DROP TABLE IF EXISTS customers;
        DROP TABLE IF EXISTS hubs;
        DROP TABLE IF EXISTS fcs;

        CREATE TABLE customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            date_of_birth TEXT NOT NULL,
            email TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            address TEXT NOT NULL,
            country TEXT NOT NULL,
            house_hold_size INTEGER NOT NULL,
            password_hash TEXT
        );

        CREATE TABLE recipes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            portion_quantity INTEGER NOT NULL,
            cook_time TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE ingredients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE articles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            nutrition_table TEXT NOT NULL,
            nutriscore TEXT NOT NULL,
            carbon_footprint REAL NOT NULL,
            is_biological INTEGER NOT NULL,
            description TEXT NOT NULL,
            image_url TEXT NOT NULL,
            is_available INTEGER NOT NULL,
            price REAL NOT NULL,
            meal_plan_checkout_max_qty INTEGER
        );

        CREATE TABLE preference_tags (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            tag_type TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE fcs (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL,
            country TEXT NOT NULL
        );

        CREATE TABLE hubs (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL,
            country TEXT NOT NULL
        );

        CREATE TABLE deliveries (
            id TEXT PRIMARY KEY,
            timeslot TEXT NOT NULL,
            delivery_moment TEXT NOT NULL,
            trip_id TEXT NOT NULL,
            hub_id TEXT NOT NULL,
            fc_id TEXT NOT NULL,
            FOREIGN KEY(hub_id) REFERENCES hubs(id),
            FOREIGN KEY(fc_id) REFERENCES fcs(id)
        );

        CREATE TABLE orders (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            creation_date TEXT NOT NULL,
            delivery_id TEXT NOT NULL,
            status TEXT NOT NULL,
            total_price REAL NOT NULL,
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(delivery_id) REFERENCES deliveries(id)
        );

        CREATE TABLE orderlines (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            sku TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(sku) REFERENCES articles(sku)
        );

        CREATE TABLE stock (
            sku TEXT NOT NULL,
            fc_id TEXT NOT NULL,
            stock_location TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            last_delivery_timestamp TEXT,
            is_marked_imperfect INTEGER NOT NULL,
            PRIMARY KEY (sku, fc_id, stock_location),
            FOREIGN KEY(sku) REFERENCES articles(sku),
            FOREIGN KEY(fc_id) REFERENCES fcs(id)
        );

        CREATE TABLE recipe_ingredients (
            recipe_id TEXT NOT NULL,
            ingredient_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            PRIMARY KEY (recipe_id, ingredient_id),
            FOREIGN KEY(recipe_id) REFERENCES recipes(id),
            FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
        );

        CREATE TABLE recipe_instructions (
            recipe_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            instruction TEXT NOT NULL,
            PRIMARY KEY (recipe_id, step_number),
            FOREIGN KEY(recipe_id) REFERENCES recipes(id)
        );

        CREATE TABLE order_recipes (
            order_id TEXT NOT NULL,
            recipe_id TEXT NOT NULL,
            PRIMARY KEY (order_id, recipe_id),
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(recipe_id) REFERENCES recipes(id)
        );

        CREATE TABLE orderline_ids (
            order_id TEXT NOT NULL,
            orderline_id TEXT NOT NULL,
            PRIMARY KEY (order_id, orderline_id),
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(orderline_id) REFERENCES orderlines(id)
        );

        CREATE TABLE article_allergy_labels (
            article_sku TEXT NOT NULL,
            allergy_label TEXT NOT NULL,
            PRIMARY KEY (article_sku, allergy_label),
            FOREIGN KEY(article_sku) REFERENCES articles(sku)
        );

        CREATE TABLE ingredient_articles (
            ingredient_id TEXT NOT NULL,
            article_sku TEXT NOT NULL,
            PRIMARY KEY (ingredient_id, article_sku),
            FOREIGN KEY(ingredient_id) REFERENCES ingredients(id),
            FOREIGN KEY(article_sku) REFERENCES articles(sku)
        );

        CREATE TABLE customer_preferences (
            customer_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            preference_level TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (customer_id, tag_id),
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(tag_id) REFERENCES preference_tags(id)
        );

        CREATE TABLE article_tags (
            article_sku TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (article_sku, tag_id),
            FOREIGN KEY(article_sku) REFERENCES articles(sku),
            FOREIGN KEY(tag_id) REFERENCES preference_tags(id)
        );

        CREATE TABLE recipe_tags (
            recipe_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (recipe_id, tag_id),
            FOREIGN KEY(recipe_id) REFERENCES recipes(id),
            FOREIGN KEY(tag_id) REFERENCES preference_tags(id)
        );

        """
    )


def normalize_row(row: dict[str, str]) -> dict[str, object]:
    normalized: dict[str, object] = {}
    for key, value in row.items():
        v = value.strip()
        if v.lower() == "true":
            normalized[key] = 1
        elif v.lower() == "false":
            normalized[key] = 0
        elif v == "":
            normalized[key] = None
        else:
            normalized[key] = v
    return normalized


def load_csv(conn: sqlite3.Connection, table: str, filename: str) -> None:
    csv_path = DATA_DIR / filename
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return

    keys = rows[0].keys()
    placeholders = ", ".join(f":{k}" for k in keys)
    sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({placeholders})"
    conn.executemany(sql, [normalize_row(r) for r in rows])


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        create_schema(conn)

        load_csv(conn, "customers", "customers.csv")
        load_csv(conn, "recipes", "recipes.csv")
        load_csv(conn, "ingredients", "ingredients.csv")
        load_csv(conn, "articles", "articles.csv")
        load_csv(conn, "fcs", "fcs.csv")
        load_csv(conn, "hubs", "hubs.csv")
        load_csv(conn, "deliveries", "deliveries.csv")
        load_csv(conn, "orders", "orders.csv")
        load_csv(conn, "orderlines", "orderlines.csv")
        load_csv(conn, "stock", "stock.csv")
        load_csv(conn, "preference_tags", "preference_tags.csv")
        load_csv(conn, "recipe_ingredients", "recipe_ingredients.csv")
        load_csv(conn, "recipe_instructions", "recipe_instructions.csv")
        load_csv(conn, "order_recipes", "order_recipes.csv")
        load_csv(conn, "orderline_ids", "orderline_ids.csv")
        load_csv(conn, "article_allergy_labels", "article_allergy_labels.csv")
        load_csv(conn, "ingredient_articles", "ingredient_articles.csv")
        load_csv(conn, "customer_preferences", "customer_preferences.csv")
        load_csv(conn, "article_tags", "article_tags.csv")
        load_csv(conn, "recipe_tags", "recipe_tags.csv")

        # Default seed password for CSV users (same hash for all rows)
        demo_hash = _hash_password("demo")
        conn.execute("UPDATE customers SET password_hash = ?", (demo_hash,))

        # Dedicated demo account (documented for hackathon login)
        conn.execute(
            "UPDATE customers SET password_hash = ? WHERE LOWER(email) = LOWER(?)",
            (_hash_password("picnic123"), "demo@picnic.com"),
        )

        conn.commit()
    finally:
        conn.close()

    print(f"SQLite database created at: {DB_PATH}")


if __name__ == "__main__":
    main()
