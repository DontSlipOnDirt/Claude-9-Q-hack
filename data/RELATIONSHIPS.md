# CSV Relationship Map

Use these keys to connect the generated CSV files:

- `orders.customer_id` -> `customers.id`
- `orders.delivery_id` -> `deliveries.id`
- `orderlines.order_id` -> `orders.id`
- `orderlines.sku` -> `articles.sku`
- `stock.sku` -> `articles.sku`
- `stock.fc_id` -> `fcs.id`
- `deliveries.fc_id` -> `fcs.id`
- `deliveries.hub_id` -> `hubs.id`
- `recipe_ingredients.recipe_id` -> `recipes.id`
- `recipe_ingredients.ingredient_id` -> `ingredients.id`
- `order_recipes.order_id` -> `orders.id`
- `order_recipes.recipe_id` -> `recipes.id`
- `article_allergy_labels.article_sku` -> `articles.sku`
- `recipe_instructions.recipe_id` -> `recipes.id`
- `ingredient_articles.ingredient_id` -> `ingredients.id`
- `ingredient_articles.article_sku` -> `articles.sku`
- `orderline_ids.order_id` -> `orders.id`
- `orderline_ids.orderline_id` -> `orderlines.id`

Bridge tables for list/map fields:

- `recipe_ingredients.csv` for `Recipe.quantified_ingredients`
- `order_recipes.csv` for `Order.recipes`
- `article_allergy_labels.csv` for `Article.allergy_labels`
- `recipe_instructions.csv` for `Recipe.instructions`
- `ingredient_articles.csv` for `Ingredient *--* Article`
- `orderline_ids.csv` for `Order.orderline_ids`
