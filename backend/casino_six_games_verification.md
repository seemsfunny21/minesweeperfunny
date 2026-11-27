# Casino v14.15 — six-game extension

## Implementation
- Eight games share the existing free virtual-chip wallet; no real-money features, purchases of chips, or redemption.
- Existing 500-chip daily wager cap, 10 Blackjack rounds and 20 slots spins retained; 20 additional rounds total across the six new games. Athens day boundaries, shared advisory lock, account row lock, request receipts, and ledger retained.
- The new games use server-side uniform rejection sampling. Results are returned in the existing round payload. Hi-Lo compares to 7, roulette accepts red/black on a 37-pocket European wheel, dice compares to 7. Exact probabilities and total returns are shown in the UI and guide.
- Database migration: backend/casino_six_games.sql, commit 4be322e0d8b271e6e3687a47274e72cd11aa09ab; applied successfully. Edge predictions-account deployed version 23 (ACTIVE), preserving prior auth configuration. UI aaf5e5087c9372973a8176ea77180d223f509f5a; styles 3dbe3a02e896fd48478467dc2eab333240c40dc4; index/PWA 2cd7ed543effa6f6ac5ff2be22c6915466e777c5 / b803caf349c21e9f5271014ed583fc9ad7c0583e.

## Verification
- Rollback-only SQL smoke test passed before migration and again after deployment; ten operation variants, replay and modified replay, common limits, pending account and RPC permissions.
- Separate rollback-only SQL test passed: actual outcome domains and payouts, insufficient balance, invalid stakes, slots and Blackjack regressions, blocking extra games during open Blackjack, state count and ledger reconciliation. No persistent synthetic test accounts or test chip changes.
- JavaScript syntax check passed; 54 mocked DOM assertions passed, covering eight cards and six new games' controls/results, including exhausted limits, disabled economy, missing state, and scratch reveal.
- Existing daily draw cron is active; 1,440 successful invocations over the preceding 24 hours at inspection. This alone does not prove a specific draw was paid.

## Remaining verification
- GitHub Pages could not be opened from the available environment (DNS failure in Chromium container and inaccessible from web retrieval); no live browser, physical mobile device, or concurrent multi-session end-to-end test was performed. Inspect deployed v14.15 and run controlled client tests before declaring full completion. No screenshots were fabricated.
