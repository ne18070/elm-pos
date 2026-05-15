# Project Instructions: ELM POS

## Supabase Security Standards

### Explicit Grants (Mandatory)
As of May 30, 2026 (for new projects) and October 30, 2026 (for existing projects), Supabase requires explicit `GRANT` statements for tables, views, and functions to be accessible via the Data API (PostgREST/GraphQL).

**Every new table or view must include:**
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.your_table TO authenticated;
GRANT ALL ON TABLE public.your_table TO service_role;
-- GRANT SELECT ON TABLE public.your_table TO anon; -- ONLY if intended for public access
```

**Every new function must include:**
```sql
GRANT EXECUTE ON FUNCTION public.your_function() TO authenticated;
GRANT EXECUTE ON FUNCTION public.your_function() TO service_role;
-- GRANT EXECUTE ON FUNCTION public.your_function() TO anon; -- ONLY if intended for public access
```

**Sequences:**
When creating tables with serial or identity columns, ensure `authenticated` has usage on sequences:
```sql
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
```

Refer to `supabase/migrations/085_explicit_grants.sql` for the baseline migration that applied these rules to all existing objects.
