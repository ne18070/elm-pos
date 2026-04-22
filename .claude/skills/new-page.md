---
name: new-page
description: Scaffold a new page in the dashboard or backoffice. Use when adding a new section, feature page, or tab to the app.
---

When creating a new dashboard page:

1. Determine the route:
   - Dashboard pages: `renderer/app/(dashboard)/<name>/page.tsx`
   - Backoffice tabs: add a new tab component inside `renderer/app/backoffice/page.tsx`

2. Check the Sidebar for existing nav items: `renderer/components/shared/Sidebar.tsx`
   - Add the new route to the sidebar nav array if it needs a nav link

3. Scaffold the page following this pattern:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useNotification } from '@/components/ui/NotificationContainer';

export default function <Name>Page() {
  const { t } = useTranslation();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      // fetch data
    } catch (err) {
      showNotification({ type: 'error', message: String(err) });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6"><Name></h1>
      {/* content */}
    </div>
  );
}
```

4. Add route-level metadata if the page is public or SEO-relevant:
   - Create `renderer/app/(dashboard)/<name>/layout.tsx` with `export const metadata`

5. If the page needs a Supabase service function, add it to `services/supabase/<domain>.ts`

6. Update the middleware public paths in `renderer/middleware.ts` only if the page should be publicly accessible without auth.
