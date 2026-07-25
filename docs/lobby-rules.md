# Lobby Rules

## Room Creation

- The TV creates the room.
- The server returns a unique short room code while the room is active.
- The TV displays the room code and QR join URL.
- The TV is a display session, not automatically a player.
- Players join through phones.
- No account is required for the MVP.
- Each joined player receives a private reconnect token.

## Lobby Limits

Initial MVP limits:

```text
Players per room: 2-8
Player name length: 2-16 characters
Custom message length: 1-40 characters
Stored lobby messages: latest 8
Quick-message cooldown: 1-2 seconds
Custom-message cooldown: 3-5 seconds
Room inactivity expiration: 2 hours
Reconnect grace period: 30 seconds
Failed host-vote cooldown: 30 seconds
```

## Player Names

- Trim whitespace.
- Reject empty names.
- Reject names shorter than 2 characters.
- Reject names longer than 16 characters.
- Duplicate names are allowed only if the UI can distinguish players by avatar or suffix.

## Messages

- Players can send quick messages from predefined options.
- Players may send short custom messages if enabled.
- Messages appear on the TV lobby.
- Store only the latest 8 messages in room state.
- Reject empty messages.
- Reject messages longer than 40 characters.
- Escape rendered content.
- Do not render player-provided HTML.
- Rate-limit messages per player.

## Initial Host Selection

Use this rule order:

1. If no host exists and a joining player requests host, that player becomes host.
2. If no host exists and a player joins as regular player, the first connected player becomes temporary host.
3. Once a host exists, new host requests become vote proposals.
4. There can be only one active host-change vote at a time.

This prevents rooms from getting stuck without a host.

## Host Permissions

Only the current host can:

- Select a game
- Start a game once games exist
- Pass host voluntarily

For the registry-shell milestone, the host can select a registered non-playable module. The start control remains disabled until a playable module exists.

## Game Registry

- Game modules expose a public manifest.
- The server owns the room's available game list.
- Clients receive available modules through `room.snapshot`.
- Only the current connected host can select a module.
- Regular players cannot select modules.
- Selecting a module does not start gameplay.
- The selected module is visible on the TV and host controller.

## Host Requests

- Any connected regular player can request host.
- If no host exists, the request succeeds immediately.
- If a host exists, the request starts a host-transfer vote.
- A player cannot start a second host request while a vote is active.

## Host Voting

Eligible voters:

- Connected players only
- Current host included
- Proposed host included

Each eligible player gets one vote.

Majority threshold:

```ts
requiredYesVotes = Math.floor(eligiblePlayerCount / 2) + 1;
```

Examples:

```text
2 players: 2 yes votes required
3 players: 2 yes votes required
4 players: 3 yes votes required
5 players: 3 yes votes required
6 players: 4 yes votes required
7 players: 4 yes votes required
8 players: 5 yes votes required
```

A vote passes immediately when yes votes reach the threshold.

A vote fails immediately when it becomes mathematically impossible to pass.

If the vote timer expires before passing, the vote fails.

## Host Pass

- The current host can voluntarily pass host to another connected player.
- If a target player is selected, that player becomes host immediately.
- If no target is selected, the longest-connected eligible player becomes host.

## Host Disconnection

When the host disconnects:

1. Start a 30-second reconnect grace period.
2. Keep host status reserved during the grace period.
3. Pause host-only actions during the grace period.
4. If the host reconnects in time, they remain host.
5. If the grace period expires, assign host to the longest-connected eligible player.

For the MVP, do not run an automatic vote after host disconnect. Automatic replacement is simpler and more reliable.

## Room Closure

A room closes when:

- The TV display session disconnects and does not reconnect within a future configured grace period.
- The room expires from inactivity.
- The server intentionally clears expired rooms.

## Security Principle

Clients send intentions. The server decides results.

Examples:

```text
Phone sends: "I request host."
Server decides: whether this starts a vote or changes host.

Phone sends: "I vote yes."
Server decides: whether the vote is valid and whether the vote passes.
```

The client must never directly assign itself host status.
