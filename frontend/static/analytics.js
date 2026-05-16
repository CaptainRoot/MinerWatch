// MinerWatch — Analytics page driver.
//
// We don't reimplement the widgets here: renderPredictions() and
// renderTopShares() live in app.js (they used to feed the dashboard
// before we moved them to a dedicated page). Both renderers know how
// to hide their own card when there's nothing to show, so the page
// degrades gracefully when no miner has produced a share yet — in
// that case the "No data yet" empty-state panel below carries the
// message.

const POLL_MS_ANALYTICS = 5000;

document.addEventListener('DOMContentLoaded', () => {
    initAnalytics().catch((err) => {
        console.error('analytics init failed', err);
    });
    // Refresh on the same cadence as the dashboard. Predictions move
    // when fleet hashrate / network difficulty change, and the
    // leaderboard refreshes after a new best-share is recorded — so
    // 5 s tracks the live data without hammering the API.
    setInterval(() => {
        renderAnalytics().catch(() => { /* swallow transient errors */ });
    }, POLL_MS_ANALYTICS);
});

async function initAnalytics() {
    await renderAnalytics();
}

async function renderAnalytics() {
    // We need the miner list to enrich the leaderboard rows with
    // family + online status. /api/miners is the same endpoint the
    // dashboard uses, so it's already warm in the poller cache.
    let miners = [];
    try {
        const data = await api('/api/miners');
        miners = (data && data.miners) || [];
    } catch (err) {
        // If the API call fails (e.g. transient network blip) we let
        // the renderers run with an empty miner list — they'll still
        // show difficulty / timestamp, just without the family pill.
        miners = [];
    }

    await Promise.all([
        renderPredictions(),
        renderTopShares(miners),
    ]);

    // Toggle the empty-state panel based on whether either card became
    // visible. Both renderers add/remove .hidden on their own root, so
    // checking the resulting class is enough — no extra state to keep.
    const predCard = document.getElementById('predictions-card');
    const topCard = document.getElementById('top-shares-card');
    const emptyEl = document.getElementById('analytics-empty');
    if (!emptyEl) return;
    const anythingVisible =
        (predCard && !predCard.classList.contains('hidden')) ||
        (topCard && !topCard.classList.contains('hidden'));
    emptyEl.classList.toggle('hidden', anythingVisible);
}
