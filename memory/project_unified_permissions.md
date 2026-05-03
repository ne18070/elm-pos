---
name: Unified Navigation & Permissions System
description: Centralized source of truth for navigation items and permission-based feature gating
type: architecture
---

The navigation and permission system has been unified to ensure consistency across Sidebar (desktop/mobile), Command Palette, and route protection.

### Key Components

- **`renderer/lib/nav-config.ts`**: The single source of truth for all navigation items. Defines labels, icons, target hrefs, and associated permission keys.
- **`renderer/lib/permissions-map.ts`**: Defines the metadata for each permission key, including required features (modules) and default roles.
- **`renderer/lib/permissions.ts`**: Contains the core logic (`checkPermission`, `hasFeature`) and unified "named permissions" (e.g., `canManageTeam`).
- **`renderer/lib/getDefaultRoute.ts`**: Determines the home page for a user based on their permissions, used after login or business switching.

### Workflows

1. **Adding a Menu Item**:
   - Define a new `PermissionKey` in `permissions-map.ts`.
   - Add the item to `NAV_SECTIONS` in `nav-config.ts`.
   - The item will automatically appear (and be hidden if permissions lack) in the Sidebar, Mobile Bottom Nav, and Command Palette.

2. **Gating a Feature**:
   - Always use `can(permission)` (client-side via `useCan`) or `checkPermission` (logic-side).
   - For simple existence checks (e.g., "does this business have the hotel module?"), use `hasFeature(business, 'hotel')`.

3. **Route Protection**:
   - `DashboardLayout` (`renderer/app/(dashboard)/layout.tsx`) automatically detects the current permission required by the URL (via `NAV_ITEMS`) and redirects unauthorized users using `getDefaultRoute`.

### Benefits

- **Maintenance**: One place to update icons, labels, or access rules.
- **Consistency**: No more cases where a link is visible but access is denied.
- **User Overrides**: All navigation elements now respect per-member permission overrides managed in the admin panel.
