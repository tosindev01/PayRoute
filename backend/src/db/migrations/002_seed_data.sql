-- Seed currencies
INSERT INTO currencies (code, name, decimals) VALUES
  ('NGN', 'Nigerian Naira', 2),
  ('USD', 'US Dollar', 2),
  ('GBP', 'British Pound', 2),
  ('EUR', 'Euro', 2),
  ('CNY', 'Chinese Yuan', 2),
  ('AED', 'UAE Dirham', 2)
ON CONFLICT DO NOTHING;

-- Seed accounts (Nigerian businesses + foreign suppliers)
INSERT INTO accounts (id, owner_name, owner_email, currency_code, balance) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Dangote Industries Ltd', 'finance@dangote.ng', 'NGN', 50000000.00),
  ('a1000000-0000-0000-0000-000000000002', 'BUA Foods Plc', 'treasury@buafoods.ng', 'NGN', 25000000.00),
  ('a1000000-0000-0000-0000-000000000003', 'Lagos Textile Importers', 'accounts@lagtex.ng', 'NGN', 10000000.00),
  ('b2000000-0000-0000-0000-000000000001', 'Global Supply Co', 'payments@globalsupply.com', 'USD', 0.00),
  ('b2000000-0000-0000-0000-000000000002', 'China Materials Ltd', 'billing@chinamat.cn', 'CNY', 0.00),
  ('b2000000-0000-0000-0000-000000000003', 'UK Parts Supplier', 'accounts@ukparts.co.uk', 'GBP', 0.00)
ON CONFLICT DO NOTHING;
