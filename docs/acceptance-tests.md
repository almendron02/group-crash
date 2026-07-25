# Acceptance Tests

The lobby MVP is complete when these behaviors work.

## TV Room

- TV can create a room.
- TV displays a short room code.
- TV displays a QR code or join URL.
- TV shows connection status.
- TV shows registered game modules or an empty game-library state.
- TV shows the selected game module after host selection.

## Phone Join

- Phone can join by room code.
- Player can enter a valid display name.
- Invalid names are rejected.
- Player can choose a chess avatar.
- Player can join as regular player.
- Player can request host while joining.
- Room rejects joins after capacity is reached.

## Live Presence

- A joined player appears on the TV without refresh.
- Player disconnect status appears on the TV.
- Player reconnect status appears on the TV.
- Refreshing a phone reconnects the same player when the reconnect token is valid.
- Reconnect fails when the token is invalid.

## Messaging

- Player can send a quick message from phone.
- Message appears on the TV without refresh.
- Latest messages are kept to the configured limit.
- Empty messages are rejected.
- Over-length messages are rejected.
- Message spam is rate-limited.
- Player-provided HTML is not rendered as HTML.

## Initial Host

- First player becomes temporary host if nobody has requested host.
- First player who requests host becomes host if no host exists.
- Once a host exists, later host requests start a vote.
- TV and phones show the current host consistently.

## Host Vote

- A regular player can request host.
- Only one host vote can be active at a time.
- Connected players can vote yes or no.
- Each eligible player gets only one vote.
- More than half of eligible connected players is required to pass.
- Vote passes immediately when the yes threshold is reached.
- Vote fails when it is impossible to reach the yes threshold.
- Vote fails when the timer expires.
- Passing vote transfers host to the proposed player.
- Failed vote leaves host unchanged.

## Host Controls

- Only the host sees enabled host controls.
- Regular players cannot select games.
- Regular players cannot start games.
- Host can select a registered game shell.
- Selecting a game shell does not start gameplay.
- Unknown game IDs are rejected.
- The host can voluntarily pass host.
- Passing host changes host server-side.

## Host Disconnect

- Host disconnection starts a 30-second grace period.
- Host reconnecting within grace keeps host status.
- Host not reconnecting within grace assigns host to the longest-connected eligible player.

## Server Authority

- A client cannot make itself host by changing local state.
- A client cannot vote for another player.
- A client cannot vote when disconnected.
- A client cannot send invalid event payloads successfully.
- All accepted actions are validated server-side.

## Visual Quality

- Static TV lobby matches the Figma direction.
- Phone join flow matches the Figma direction.
- Phone lobby states match the Figma direction.
- TV text is readable at 1920 x 1080.
- Phone controls fit at 390 x 844.
- Long names and messages do not break layout.
- TV focus states are obvious.
