---
name: supabase-migration
description: Create a new Supabase migration file. Use when adding tables, columns, RLS policies, or RPC functions to the database.
---

When creating a Supabase migration:

1. Run `ls supabase/migrations/ | sort` to find the latest migration number
2. Create a new file: `supabase/migrations/0NN_<short_description>.sql`
3. Follow this structure:

```sql
-- Description of what this migration does

-- Table creation
CREATE TABLE IF NOT EXISTS public.<table_name> (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (always)
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

-- RLS policies (users can only access their own business data)
CREATE POLICY "<table_name>_select" ON public.<table_name>
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "<table_name>_insert" ON public.<table_name>
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "<table_name>_update" ON public.<table_name>
  FOR UPDATE USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "<table_name>_delete" ON public.<table_name>
  FOR DELETE USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );
```

For SECURITY DEFINER RPCs (used to bypass RLS for superadmin operations):

```sql
CREATE OR REPLACE FUNCTION public.<fn_name>()
RETURNS <return_type>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check caller is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM public.superadmins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Function body
END;
$$;
```

4. After creating the file, note that the migration must be applied via `supabase db push` or the Supabase dashboard.
