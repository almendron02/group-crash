# Product Spec

## One-Sentence Product

Group Crash is a web-first party-game platform where a TV runs the shared room and players use phones as private controllers.

## First Milestone

The first milestone is a working live lobby. It should feel polished enough to show as a portfolio demo even before games exist.

## Users

- Host player: the person currently allowed to choose games and control lobby progression.
- Regular player: any connected phone participant.
- TV viewer: anyone watching the shared room screen.

The TV itself is not automatically a player.

## TV Lobby Requirements

The TV lobby must show:

- Group Crash brand/logo
- Room code
- QR code or join URL
- Connected players
- Current host
- Players who want host
- Live quick-message feed
- Host-transfer vote when active
- Empty game-library state
- Player count
- Connection status

The TV lobby must be readable from across a room.

## Phone Join Requirements

The phone join flow must let a player:

1. Open a room join URL.
2. Confirm the room code.
3. Enter a display name.
4. Pick a chess avatar.
5. Join as a regular player or request host.
6. Enter the lobby.

The flow should keep one main decision per screen.

## Phone Lobby Requirements

The regular player phone lobby must show:

- Player name and avatar
- Room code
- Current host
- Connected player count
- Quick-message buttons
- Optional short message input
- Request-host button
- Active host vote controls when relevant
- Leave-room control
- Connection status

The host phone lobby must also show:

- Host badge
- Game-selection area
- Empty game-library state
- Disabled start control while no games exist
- Pass-host control

## Chess Avatars

The initial avatar set is:

- Pawn
- Knight
- Bishop
- Rook
- Queen
- King

Sample identity mapping:

- Alex: King
- Maya: Queen
- Zoe: Knight
- Jay: Bishop
- Sam: Rook
- Leo: Pawn

## Out Of Scope For This Milestone

- Playable games
- Game rules
- Public room discovery
- Accounts and login
- Persistent profiles
- Payments
- Voice chat
- Native TV app packaging
- Database storage
- AI features

## Portfolio Goal

The lobby should demonstrate:

- Cross-device product thinking
- Real-time state synchronization
- Server-authoritative multiplayer architecture
- Strong visual design implementation
- Modular platform planning

