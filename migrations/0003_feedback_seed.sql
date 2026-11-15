-- Seed the user-managed category lists from the previous fixed lists plus any values already in use.
INSERT INTO categories (kind, name, sort_order)
SELECT v.kind, v.name, v.ord FROM (VALUES
  ('product', 'Textbook', 1), ('product', 'Workbook', 2), ('product', 'Guide', 3),
  ('product', 'Copies', 4), ('product', 'Certificates', 5), ('product', 'Report Cards', 6),
  ('product', 'Toddler Books', 7), ('product', 'Brochures', 8), ('product', 'School Prospectus', 9),
  ('product', 'Stationery', 10), ('product', 'Other', 99),
  ('customer', 'School', 1), ('customer', 'Bookshop', 2), ('customer', 'Dealer', 3),
  ('customer', 'Institution', 4), ('customer', 'Distributor', 5), ('customer', 'Other', 99),
  ('customerLocation', 'Karachi', 1), ('customerLocation', 'Outside Karachi', 2),
  ('supplier', 'Paper Supplier', 1), ('supplier', 'Card Supplier', 2), ('supplier', 'Printer', 3),
  ('supplier', 'Binder', 4), ('supplier', 'Plate Maker', 5), ('supplier', 'Laminator', 6),
  ('supplier', 'Transporter', 7), ('supplier', 'Designer', 8), ('supplier', 'Packaging Supplier', 9),
  ('supplier', 'Other Service Provider', 99)
) AS v(kind, name, ord)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (kind, name, sort_order)
SELECT DISTINCT 'product', category, 50 FROM products WHERE category <> '' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (kind, name, sort_order)
SELECT DISTINCT 'customer', category, 50 FROM customers WHERE category <> '' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (kind, name, sort_order)
SELECT DISTINCT 'supplier', category, 50 FROM suppliers WHERE category <> '' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Existing customers with a city other than Karachi are classified as Outside Karachi.
UPDATE customers SET location = 'Outside Karachi'
WHERE city <> '' AND lower(city) NOT LIKE '%karachi%' AND location = 'Karachi';
--> statement-breakpoint
-- Company letterhead details (only where not already filled in).
UPDATE company SET
  address = CASE WHEN address = '' THEN '27/C, Mezzanine floor, 13th Commercial Street, Phase II Ext DHA, Karachi.' ELSE address END,
  phone = CASE WHEN phone = '' THEN '021-35393151-52' ELSE phone END,
  email = CASE WHEN email = '' THEN 'publishersturnkey@gmail.com' ELSE email END;
