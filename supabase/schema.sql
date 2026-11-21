-- ==============================================================================
-- BAMBINO DATABASE SCHEMA & MIGRATION SCRIPT
-- Completely fresh setup for Bambino with Admin Password '5831'
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. VERSIONS TABLE
CREATE TABLE IF NOT EXISTS public.versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. APP SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  version_id UUID NOT NULL REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_key_version_unique UNIQUE (key, version_id)
);
CREATE INDEX IF NOT EXISTS idx_app_settings_version ON public.app_settings(version_id);

-- 3. STAFF MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.staff_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  version_id UUID NOT NULL REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_members_version ON public.staff_members(version_id);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT products_code_version_unique UNIQUE (code, version_id)
);
CREATE INDEX IF NOT EXISTS idx_products_version ON public.products(version_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- 5. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  shop_name TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  is_new BOOLEAN NOT NULL DEFAULT true,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_version ON public.customers(version_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- 6. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number INTEGER NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  shop_name TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  branch TEXT,
  delivery_date DATE,
  shipping_company TEXT,
  deposit_method TEXT CHECK (deposit_method IN ('cash', 'instapay', 'vodafone_cash')),
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  extra_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  staff_member_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_member_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT orders_number_version_unique UNIQUE (order_number, version_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_version ON public.orders(version_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);

-- 7. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_description TEXT,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_version ON public.order_items(version_id);

-- 8. DEPOSITS TABLE
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'instapay', 'vodafone_cash')),
  branch TEXT,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deposits_order ON public.deposits(order_id);
CREATE INDEX IF NOT EXISTS idx_deposits_version ON public.deposits(version_id);

-- 9. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_version ON public.expenses(version_id);

-- 10. SHIPPING DETAILS TABLE
CREATE TABLE IF NOT EXISTS public.shipping_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  shipping_company TEXT,
  tracking_number TEXT,
  notes TEXT,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_details_order ON public.shipping_details(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_details_version ON public.shipping_details(version_id);

-- 11. STOCK ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_product ON public.stock_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_version ON public.stock_alerts(version_id);

-- 12. ORDER RETURNS TABLE
CREATE TABLE IF NOT EXISTS public.order_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_returns_order ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_version ON public.order_returns(version_id);

-- 13. ORDER REFUNDS TABLE
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order ON public.order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_version ON public.order_refunds(version_id);

-- ==============================================================================
-- FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Function: update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: update_products_updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_customers_updated_at
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_orders_updated_at
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_expenses_updated_at
DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_shipping_details_updated_at
DROP TRIGGER IF EXISTS update_shipping_details_updated_at ON public.shipping_details;
CREATE TRIGGER update_shipping_details_updated_at
  BEFORE UPDATE ON public.shipping_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: deduct stock when order item is inserted (multiplied by pieces from description e.g. '500/10' -> 10)
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_multiplier INTEGER := 1;
  v_desc TEXT;
BEGIN
  -- Get multiplier from NEW.product_description or from public.products
  IF NEW.product_description IS NOT NULL AND NEW.product_description ~ '/[0-9]+' THEN
    v_multiplier := CAST(SUBSTRING(NEW.product_description FROM '/([0-9]+)') AS INTEGER);
  ELSE
    SELECT description INTO v_desc FROM public.products WHERE id = NEW.product_id;
    IF v_desc IS NOT NULL AND v_desc ~ '/[0-9]+' THEN
      v_multiplier := CAST(SUBSTRING(v_desc FROM '/([0-9]+)') AS INTEGER);
    END IF;
  END IF;

  IF v_multiplier IS NULL OR v_multiplier < 1 THEN
    v_multiplier := 1;
  END IF;

  UPDATE public.products
  SET stock_quantity = stock_quantity - (NEW.quantity * v_multiplier)
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS deduct_stock_trigger ON public.order_items;
CREATE TRIGGER deduct_stock_trigger
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_order();

-- Function: record deposit automatically when order with deposit is created
CREATE OR REPLACE FUNCTION public.record_deposit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deposit_amount > 0 AND NEW.deposit_method IS NOT NULL THEN
    INSERT INTO public.deposits (order_id, order_number, customer_name, amount, method, version_id, branch)
    VALUES (NEW.id, NEW.order_number, NEW.customer_name, NEW.deposit_amount, NEW.deposit_method, NEW.version_id, NEW.branch);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS record_deposit_trigger ON public.orders;
CREATE TRIGGER record_deposit_trigger
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_deposit();

-- Function: get sequential order number per version
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_version_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_next
  FROM public.orders
  WHERE version_id = p_version_id;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- Function: execute readonly report SQL safely
CREATE OR REPLACE FUNCTION public.execute_readonly_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  cleaned_query text;
  lower_q text;
BEGIN
  cleaned_query := regexp_replace(btrim(query), ';+\s*$', '');
  lower_q := lower(cleaned_query);

  IF NOT (lower_q LIKE 'select%' OR lower_q LIKE 'with%') THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;

  IF lower_q ~* '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|copy|call|do|execute)\b' THEN
    RAISE EXCEPTION 'Unsafe SQL command detected';
  END IF;

  IF lower_q ~* ';' THEN
    RAISE EXCEPTION 'Only one query statement is allowed';
  END IF;

  EXECUTE 'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (' || cleaned_query || ') t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  EXECUTE 'CREATE POLICY "Allow public access" ON public.versions FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.app_settings FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.staff_members FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.products FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.customers FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.orders FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.order_items FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.deposits FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.expenses FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.shipping_details FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.stock_alerts FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.order_returns FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public access" ON public.order_refunds FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==============================================================================
-- TABLE PRIVILEGES & GRANTS (Essential for Supabase client / anon access)
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ==============================================================================
-- INITIAL SEED DATA (Active Version '2026' & Admin Password: 5831)
-- ==============================================================================

DO $$
DECLARE
  v_version_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Insert or update default active version '2026'
  IF NOT EXISTS (SELECT 1 FROM public.versions WHERE id = v_version_id) THEN
    INSERT INTO public.versions (id, name, is_active)
    VALUES (v_version_id, '2026', true);
  ELSE
    UPDATE public.versions
    SET name = '2026', is_active = true
    WHERE id = v_version_id;
  END IF;

  -- Ensure any other version is inactive
  UPDATE public.versions SET is_active = false WHERE id != v_version_id;

  -- 2. Insert admin password: 5831
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'admin_password' AND version_id = v_version_id) THEN
    INSERT INTO public.app_settings (key, value, version_id)
    VALUES ('admin_password', '5831', v_version_id);
  ELSE
    UPDATE public.app_settings
    SET value = '5831'
    WHERE key = 'admin_password' AND version_id = v_version_id;
  END IF;
END $$;
