// Feature flags for work that is parked but intentionally kept in the tree.
//
// SYSTEM_PAGE_ENABLED — the host-metrics "System" page. Its data
// collection and the `supported` capability detection (see
// backend/system_info.py) all work, but the page is unreliable on
// non-Pi platforms — notably inside the Umbrel container, where limited
// /sys access, the overlay filesystem reported as "disk", and the
// absence of vcgencmd make the readings misleading. Until that's
// reworked, the page and its sidebar entry are hidden on every host.
//
// Flip this to `true` to bring it back exactly as it was: the gating in
// AppShell and SystemPage already keys off the backend `supported` flag,
// so nothing else was removed.
export const SYSTEM_PAGE_ENABLED = false;
