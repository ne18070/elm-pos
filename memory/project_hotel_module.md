---
name: Hotel Module & Business Type Configuration
description: Hotel management module and business-type-based feature gating added to elm-pos
type: project
---

Added hotel management module (migration 036) and business type configuration screen.

**Why:** User wanted a complete hotel management system (rooms, guests, reservations, check-in/out, room services) and a visual configuration screen to gate features by business type.

**How to apply:** When touching hotel features, the service layer is at services/supabase/hotel.ts. The page is at renderer/app/(dashboard)/hotel/page.tsx. Feature gating is centralized in renderer/lib/permissions-map.ts via the `PERMISSIONS` table.

Key files:
- supabase/migrations/036_hotel.sql — 4 tables: hotel_rooms, hotel_guests, hotel_reservations, hotel_services
- services/supabase/hotel.ts — service layer with checkIn/checkOut/addService
- renderer/app/(dashboard)/hotel/page.tsx — 3-tab UI (Chambres, Réservations, Clients)
- renderer/app/(dashboard)/configure/page.tsx — visual business type configuration screen
- renderer/lib/permissions-map.ts — Centralized feature gating and role defaults
- renderer/components/shared/Sidebar.tsx — Simplified NAV_SECTIONS, visibility relies purely on permissions
- renderer/components/shared/CreateBusinessModal.tsx — redirects to /configure after creation
- renderer/app/(dashboard)/settings/page.tsx — shows current type with link to /configure

Business type feature matrix:
- retail: POS, Stock, Approvisionnement, Livraisons, Revendeurs, Coupons, Catégories
- restaurant: POS, Stock, Approvisionnement, Livraisons, Coupons, Catégories
- service: POS, Produits/services, Commandes, Catégories
- hotel: POS, Hotel module, Coupons
- All types: Statistiques, Comptabilité, Journal, Récupération, Paramètres
