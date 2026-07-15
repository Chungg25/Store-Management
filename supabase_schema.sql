CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    unit VARCHAR,
    category VARCHAR,
    min_quantity INTEGER DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    exp_warning_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
    import_price DECIMAL(12, 2),
    expiration_date DATE,
    original_quantity INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    action VARCHAR NOT NULL,
    quantity INTEGER NOT NULL,
    user_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.implants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    category VARCHAR,
    unit VARCHAR,
    quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_id ON public.inventory_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_item_id ON public.transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_implants_category ON public.implants(category);
