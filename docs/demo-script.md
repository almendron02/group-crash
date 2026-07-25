# Demo Script

Use this when recording a 60-90 second portfolio demo.

## Setup

Open the TV app:

```text
https://crashtv.formawebsite.com
```

Join with two or more phones:

```text
https://crash-join.formawebsite.com
```

## Recording Flow

1. Show the TV lobby with the room code and QR code.
2. Join from a phone and show the player appearing live on the TV.
3. Send a quick message and show it appearing at the top of the TV feed.
4. Request host from another phone and show the voting state.
5. Use the host controls to lock the room and change capacity.
6. Mute one player and show their shout blocked.
7. Select `Imposter Crash` and start the game.
8. Show that phones receive private roles while the TV shows only public state.
9. Return to the lobby.
10. Select `Sketch Crash`.
11. Draw from the drawer phone and show the TV updating live.
12. End on the final scoreboard or results screen.

## Short Voiceover

```text
Group Crash is a second-screen party-game platform built with React,
TypeScript and a server-authoritative WebSocket backend.

The TV is only the shared display. Players scan the QR code and use their phones
as private controllers.

The server owns the room, host permissions, reconnect tokens, moderation
controls and private game state, so clients cannot make themselves host or read
another player's secret information.

The platform already supports modular games, including Imposter Crash and Sketch
Crash, and it is deployed publicly with custom Forma subdomains.
```
