# Hotel Booking System implementation plan

This plan defines the intended milestone sequence for the SoftUni “Software Technologies with AI” capstone project. No application features are implemented by this planning step.

## Milestone 0 — Project foundation

- Confirm the repository layout and preserve unrelated workspace changes.
- Establish the Vite/npm project scripts and the multi-page HTML entry structure.
- Add shared CSS, Bootstrap integration, and vanilla ES module boundaries.
- Document local setup, environment variable names, and safe key handling without inventing credentials or URLs.
- Add the initial Supabase migration workflow and keep committed migrations aligned with remote migration history.
- Verify the foundation with the available checks and a production build.

## Milestone 1 — Database and access-control foundation

- Model hotels, room types, physical rooms, images, reservations, and user roles.
- Define constraints for one physical room per reservation and booking integrity.
- Add database-enforced access control for public, guest, and admin operations.
- Verify the schema and policies against the official Supabase documentation.

## Milestone 2 — Public browsing and availability

- Build the public hotel listing, hotel details, room information, and availability search pages.
- Support EUR pricing and pay-at-hotel presentation.
- Render all user-controlled or database-provided content safely.
- Verify responsive and accessible behavior.

## Milestone 3 — Guest authentication and reservations

- Add guest registration, login, logout, and authenticated session handling.
- Implement reservation creation with immediate confirmation when inventory is available.
- Add guest booking history and eligible cancellation.
- Verify authorization, booking-conflict handling, and user-visible error states.

## Milestone 4 — Admin management

- Add admin workflows for hotels, room types, physical rooms, images, and reservations.
- Keep privileged operations protected by Supabase policies and server-safe boundaries.
- Verify admin authorization and safe image/storage handling.

## Milestone 5 — Deployment and release verification

- Prepare the static site for Render deployment using configured project settings only.
- Run the complete relevant check suite and production build.
- Review the final diff and verify deployment configuration without inventing URLs or credentials.
- Commit only the completed milestone and push to the configured remote when available.

## Working agreement

Implement only the current milestone. After every successful milestone, run relevant checks and build when available, review the diff, and report results honestly. Do not implement application features until the applicable milestone is authorized.
