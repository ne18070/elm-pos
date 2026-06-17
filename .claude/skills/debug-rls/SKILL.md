---
name: debug-rls
description: Debug Supabase Row Level Security issues. Use when a query returns empty results, permission denied errors, or unexpected 401/403 responses.
---

When debugging an RLS issue:

1. **Identify the symptom**:
   - Empty results (no error, but no data) → RLS is silently filtering rows
   - "permission denied for table" → RLS enabled with no SELECT policy
   - "new row violates row-level security" → INSERT policy missing or wrong check
   - Client gets 401/session expired → usually a missing API route or JWT issue, not RLS

2. **Check if RLS is enabled** on the table:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```

3. **List existing policies**:
   ```sql
   SELECT policyname, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = '<table>';
   ```
   - If zero rows → deny-all (even SELECT is blocked)

4. **Common fixes**:

   a. Table needs to be accessible to authenticated users:
   ```sql
   CREATE POLICY "<table>_select" ON public.<table>
     FOR SELECT USING (auth.uid() IS NOT NULL);
   ```

   b. Table scoped to user's business:
   ```sql
   CREATE POLICY "<table>_select" ON public.<table>
     FOR SELECT USING (
       business_id IN (
         SELECT id FROM public.businesses WHERE owner_id = auth.uid()
         UNION
         SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
       )
     );
   ```

   c. Superadmin-only table → use service role key via API route (do NOT add a blanket superadmin policy in SQL, use `SECURITY DEFINER` RPC or the service role key server-side)

5. **Test with service role** to confirm data exists:
   - Use Supabase Dashboard > Table Editor (bypasses RLS)
   - Or create a temp `SECURITY DEFINER` function to inspect

6. **"Session expirée" in the UI** is usually NOT an RLS error — check:
   - Is the API route actually defined? (Next.js returns 404 HTML → JSON parse fails → "token" in error → toUserError maps to "Session expirée")
   - Is the Bearer token being sent in the request headers?
