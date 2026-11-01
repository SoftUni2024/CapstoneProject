# Application access model

This document defines the intended application permissions for the CapstoneProject Supabase integration. It is a design contract for future schema, RLS, and authorized-operation work; it does not create tables, migrations, grants, or policies.

## Security boundary

The browser application uses only the Supabase project URL and publishable key through `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Never put a Supabase secret key, `service_role` key, database password, or other privileged credential in frontend code, a `VITE_*` environment variable, committed files, or browser-visible configuration. Privileged development tools and MCP access remain separate from application data access.

## Roles and permitted operations

### Visitor

- Read published hotels.
- Read room type information for published hotels.
- Read catalog images associated with published hotels and room types.
- Search aggregate availability.
- Cannot read or modify bookings.
- Cannot read guest profiles.
- Cannot read or modify physical-room inventory.

### Guest

A guest has all visitor permissions, plus:

- Read permitted fields of their own profile.
- Update permitted fields of their own profile.
- Create bookings only through an authorized operation that validates identity, availability, pricing, and booking ownership.
- Cannot read other guests' profiles or bookings.
- Cannot directly manage physical-room inventory or administrative data.

### Admin

- Manage hotels.
- Manage room types.
- Manage physical rooms.
- Manage catalog images.
- Read all bookings.
- Perform supported reservation-administration operations.

Administrative permissions must be enforced by authenticated server-side or database authorization. They must not depend on frontend visibility or user-editable profile metadata.

## Implementation guardrails

- Keep application client access separate from privileged development tools and MCP credentials.
- Use publishable client credentials only in the frontend.
- Define row-level security and authorized operations only after the schema and field-level ownership rules are agreed.
- Do not create permissive policies as a shortcut; future policies should be role-specific and ownership-aware.
- Do not create tables, migrations, or access policies as part of this access-model definition.
