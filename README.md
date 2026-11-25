# Predictions — standalone preview

No production account, personal data, API keys or real balance is exposed by this preview. The prior Games backend remains untouched until the separate Supabase project is provisioned and a verified migration can take place.

## Rules
- Athens timezone, Mon–Fri only; 12:00–00:00 bets; 22:00 reminder to nonparticipants; votes 10:00–12:00; settlement at noon. Friday targets next workday.
- Five automatically selected available staff, maximum seven. Exclude leave and departed workers. Holidays must come from server configuration.
- Fixed odds, 1–5 picks, void pick 1.00; one bet per event per player. Proposed stake 10–1000 and return cap 10000 pending economy simulation.
- Weekly credit 1000; protected 100 for each remaining working day; loans up to 300 principal/week, unpaid principal plus 10% at Monday credit. Interest rounding proposed upward to whole chip.
- Net performance excludes free grants, loan principal, collectibles; settled tickets plus confirmed resignation bonuses and net interest.
- Resignation bonus 2000 once per correct confirmed prediction. Exact boundaries and odds still need final specification.
- Admin approval required before credit or access; PIN reset requires target's new PIN twice, then admin reauthentication and session revocation. No credentials in logs. Private profiles/avatars, no live picks visible to others.
- No real cash, prizes or conversion. Trophy prices and XP rules pending balancing.

Run: node rules.test.cjs. Pure client preview rules are NOT authorization; implement them transactionally server-side.
