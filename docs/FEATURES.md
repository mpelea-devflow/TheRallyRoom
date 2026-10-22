# Rallyroom features and rules

## How a session works

```text
Host starts a session → shares QR → players join
                                      ↓
               app assigns eligible players → game starts automatically
                                      ↓
                 finishes game → players return to queue
```

A host can create a session without an account. Supabase retains an anonymous host identity in the same browser; clearing browser data or switching devices loses host access until a recovery or account-linking feature is added. A host creates a named session with a venue, courts and default rules. The live dashboard shows courts, current games, player counts and the waiting queue. Hosts add/remove courts, add players, manage court rules and rosters, pause/resume/remove players, lock partners or groups of four, and end a session after confirmation. A player can join by scanning the live session QR code or be added by the host. Self-reported ratings are not verified DUPR ratings. Guests can see their own status and the session. Refreshing the same browser retains the player association.

When enough eligible players are available, the app assigns and starts games automatically in court order. Players in a game no longer appear in the waiting queue or another court. The host presses **Finish game** to return the finishers to the queue; the app immediately fills available courts again when possible. The host's live session page must remain open: automatic assignment runs in that browser, and QR joins are picked up on the next refresh (normally within three seconds). If a join races with a host update, a stale write fails and refreshes. A game with a missing player cannot be finished until a replacement fills the slot.

Player names must be unique among active participants, ignoring capitalization and extra whitespace. A name can be reused once its player has left. The host and join form show a validation message when the name is taken. For QR joins, the database checks the name while locking the session so concurrent joins cannot claim the same name. Existing installations must apply the duplicate-name migration for the database check.

## Ending a session

The host confirms **End session**. After the change is saved, the host returns to the home page. An ended session rejects new joins and session updates; visitors to its old link see a thank-you message and a red ended status instead of session controls. Existing Supabase installations need the ended-session migration for guest links and database-side update protection.

## Upcoming groups

The queue shows up to two estimated upcoming groups, their team arrangements, and the court used to calculate each group. These are estimates, not reservations: the app projects games from currently waiting players using the same matchmaking rules, assuming courts become available in their displayed order. A court may appear more than once when there is only one suitable court. Players already on court are not included in the projection, because their return time is unknown. Groups can change when another court finishes first or players join, pause, resume, leave, or have their rules or assignments changed. The remaining waiting list appears below the groups.

## Queue and fairness

Players join at the back of the waiting queue. On completion, the four finishers return to its back in team order. New arrivals while a game is being played remain ahead of those returning.

```text
Playing: P1 P2 vs P3 P4    Waiting: P5 → P6 → P7 → P8
P9 arrives:                Waiting: P5 → P6 → P7 → P8 → P9
Game finishes:             Waiting: P5 → P6 → P7 → P8 → P9 → P1 → P2 → P3 → P4
```

For each available court in court order, the algorithm filters the remaining queue by player availability, court roster assignment, court roster mode, and the court's effective skill rule, then considers the first **eight eligible waiting players**. It enumerates valid four-player groups and team arrangements, keeping locked pairs together and requiring locked groups to play as a complete four. A mixed-skill game requires one player below the split and one at or above it on each team. Same-skill means all four fall in the configured inclusive range; a new-player court requires all four to be marked new. Open play has no rating restriction.

Valid choices are ranked lexicographically, with the following priorities:

1. Minimize earlier-arrival safeguard violations. A violation occurs when a selected player has an earlier-arriving, unselected eligible player in the window with no more completed games. This means an earlier player is favored when a later player's next game would otherwise put them ahead. If no valid group avoids a violation, the best valid group can play so the court is not left idle. A player outside the window, unavailable or ineligible for the court is not part of this comparison.
2. Include as many protected players as possible, then include the longest-waiting eligible player when a valid group permits it.
3. Reduce encounters with players from the immediately previous game, then reduce repeated partners from that game. Prefer earlier queue positions next, then smaller team-rating difference as a tie-breaker.
4. When a game starts, any player skipped ahead of the last selected queue position becomes protected. A protected player remains protected until selected, paused or removed. Court rules and locked pairs can make it impossible to include every protected player immediately.

The guardrail takes precedence over mixing and protection. As a result, equal-count earlier arrivals can keep the same group together even with other waiting players. This is a deliberate consequence of the agreed guardrail, rather than a guarantee that every game has new opponents. The implementation uses **completed** game counts, because a player replaced during a game does not receive credit for that game. In-progress games do not count until finished. Different court eligibility, pairing constraints and the empty-court exception mean the guardrail is a priority, not an absolute guarantee across all courts.

Example of permissible mixing when later arrivals have fewer games:

```text
Queue:       P1 P2 P3 P4 | P5 P6 P7 P8
Past games:  same group A | same group B
Counts:      1  1  1  1  | 0  0  0  0
Possible:    P1 + P5 vs P2 + P6
Protected:   P3, P4 (skipped); next eligible selection favors them.
```

If all eight have the same number of games and P1–P4 arrived earlier, the guardrail instead favors P1–P4 when they form a valid game. A locked pair cannot be split to fill a group. If the pair or an assigned player cannot form a valid game, they wait and the court can use another valid group within the window.

## Court rules, rosters and pairs

Session rules apply by default. A court can override them with open play, an inclusive rating range, mixed bands (minimum, split, maximum), or new players only. Assign a player to a court from Players; assigned players are restricted to that court until unassigned. “Roster only” restricts a court to its assigned players; “roster + eligible players” also admits eligible unassigned players. Open court mode admits eligible unassigned and assigned-to-this-court players. Removing a court unassigns its players. A locked pair remains on the same team until unlocked or re-paired; conflicts with roster, rating or availability can prevent a lineup.

```text
Court 1 · roster only        Court 2 · mixed skills
P1 P2 P3 P4 P5 P6            2.50 + 3.50 vs 2.75 + 3.25
rotate here                  split at 3.00
```

## Locked groups of four

In **Players → Manage groups**, the host selects four participants and locks them together. The group stays in effect until the host unlocks it or the session ends. Players can be selected while waiting, playing, or paused; a newly locked group applies to future games and does not interrupt a game already in progress.

```text
Locked group: P1, P2, P3, P4
Game 1:       P1 + P2 vs P3 + P4
Game 2:       P1 + P3 vs P2 + P4  (when allowed by the rules)
```

The app varies team arrangements where possible, but an existing locked pair remains on the same team. A selected player’s locked partner must also be included in the group; the pair can be unlocked first instead. A player can belong to only one locked group, and new pairings cannot cross between a locked group and other players.

All four must be waiting and eligible for the same available court. Court rules, assignments and the eight-player fairness window still apply. If a member is paused, has left, is on another court, or is ineligible, the group cannot start a new game until the issue is resolved or the host unlocks the group. Other eligible players can still play. If a grouped player is paused during a game, normal replacement applies to that current game; the locked group remains in effect for future games.

## Pause, resume and replacement

Pausing a waiting player removes them from matchmaking. When a player on court is paused or removed, the app tries waiting eligible players in priority and queue order, keeping the existing teams and all court/pair rules valid. If nobody fits, the court displays a vacancy; the host can try an eligible replacement from court management after circumstances change. The court cannot finish until filled. A paused player's locked partnership is not silently broken; the host may need to unlock it before finding a replacement.

```text
Playing: P1 + P2 vs P3 + P4     Waiting: P5 → P6
Pause P2; P5 is valid: P1 + P5 vs P3 + P4
On finish: P5 gains a game; P2 does not.
```

A resumed player is placed at the back of the applicable queue, preserving their court assignment. A player removed from the session is no longer eligible. There is no separate no-show status. If no valid replacement exists, the existing game remains open until the host resolves the vacancy; there is no cancellation control yet.
