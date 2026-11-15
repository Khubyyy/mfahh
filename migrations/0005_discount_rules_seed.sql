-- Existing customer discounts become each customer's default (editable) percentage rule.
INSERT INTO customer_discount_rules (customer_id, category, kind, value, mode)
SELECT id, '', 'pct', discount_pct, 'editable' FROM customers WHERE discount_pct > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- The per-item rupee discount is frozen on posted lines like every other priced column.
CREATE OR REPLACE FUNCTION document_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM documents WHERE id = coalesce(NEW.document_id, OLD.document_id);
  IF st = 'Draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Lines of a % document cannot be added or removed', st;
  END IF;
  IF (NEW.document_id, NEW.line_no, NEW.product_id, NEW.account_id, NEW.party_type, NEW.party_id, NEW.qty, NEW.rate,
      NEW.discount_pct, NEW.discount_rs, NEW.amount, NEW.debit, NEW.credit, NEW.ref_line_id)
     IS DISTINCT FROM
     (OLD.document_id, OLD.line_no, OLD.product_id, OLD.account_id, OLD.party_type, OLD.party_id, OLD.qty, OLD.rate,
      OLD.discount_pct, OLD.discount_rs, OLD.amount, OLD.debit, OLD.credit, OLD.ref_line_id) THEN
    RAISE EXCEPTION 'Lines of a % document cannot be edited', st;
  END IF;
  IF st IN ('Approved','Cancelled') AND NEW.unit_cost IS DISTINCT FROM OLD.unit_cost AND OLD.unit_cost IS NOT NULL THEN
    RAISE EXCEPTION 'Posted unit cost cannot be changed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
INSERT INTO categories (kind, name, sort_order) VALUES
  ('product', 'Practical Journals', 11), ('product', 'References', 12)
ON CONFLICT DO NOTHING;
