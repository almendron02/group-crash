import { useState } from "react";
import { Gamepad2, MessageCircle, UsersRound, Vote } from "lucide-react";
import {
  castNextLocalHostVote,
  createLocalLobbyRoom,
  getNextPreviewPlayer,
  joinLocalPlayer,
  quickMessageOptions,
  removeLocalPlayer,
  requestLocalHost,
  sendLocalMessage,
  type LobbyActionResult,
  type RoomSnapshot
} from "@group-crash/protocol";
import {
  Badge,
  Button,
  ChatMessage,
  ChessAvatar,
  EmptyGameCard,
  HostVotePanel,
  LogoMark,
  PlayerCard,
  QrCard,
  RoomCodePill,
  StatusPill
} from "@group-crash/ui";

type TvMode = "lobby" | "vote";

function getInitialTvMode(): TvMode {
  if (typeof window === "undefined") {
    return "lobby";
  }

  return new URLSearchParams(window.location.search).get("state") === "vote"
    ? "vote"
    : "lobby";
}

export function App() {
  const [room, setRoom] = useState<RoomSnapshot>(() =>
    createLocalLobbyRoom(getInitialTvMode())
  );
  const [notice, setNotice] = useState("Local lobby simulation is active.");

  const host = room.players.find((player) => player.id === room.hostPlayerId);
  const hostCandidates = room.players.filter(
    (player) => player.wantsHost && !player.isHost
  );
  const visibleMessages = room.activeHostVote
    ? room.messages.slice(0, 3)
    : room.messages;
  const nextPreviewPlayer = getNextPreviewPlayer(room);

  function applyLocalAction(result: LobbyActionResult) {
    setRoom(result.room);
    setNotice(result.notice);
  }

  function addPreviewPlayer() {
    if (!nextPreviewPlayer) {
      applyLocalAction({
        room,
        notice: "No more preview players are waiting.",
        status: "blocked"
      });
      return;
    }

    applyLocalAction(joinLocalPlayer(room, nextPreviewPlayer));
  }

  function removePreviewPlayer() {
    const removablePlayer = [...room.players]
      .reverse()
      .find((player) => !player.isHost);

    if (!removablePlayer) {
      applyLocalAction({
        room,
        notice: "No regular player can leave right now.",
        status: "blocked"
      });
      return;
    }

    applyLocalAction(removeLocalPlayer(room, removablePlayer.id));
  }

  function sendPreviewShout() {
    const sender =
      room.players.find(
        (player) => player.connectionStatus === "connected" && !player.isHost
      ) ?? host;
    const message =
      quickMessageOptions[room.messages.length % quickMessageOptions.length];

    if (!sender) {
      applyLocalAction({
        room,
        notice: "No connected player can shout right now.",
        status: "blocked"
      });
      return;
    }

    applyLocalAction(sendLocalMessage(room, sender.id, message));
  }

  function requestPreviewHost() {
    const requester =
      hostCandidates.find((player) => player.connectionStatus === "connected") ??
      room.players.find(
        (player) => player.connectionStatus === "connected" && !player.isHost
      );

    if (!requester) {
      applyLocalAction({
        room,
        notice: "No eligible player can request host.",
        status: "blocked"
      });
      return;
    }

    applyLocalAction(requestLocalHost(room, requester.id));
  }

  function castPreviewYesVote() {
    applyLocalAction(castNextLocalHostVote(room, "yes"));
  }

  function resetPreviewRoom() {
    setRoom(createLocalLobbyRoom(getInitialTvMode()));
    setNotice("Local lobby simulation reset.");
  }

  return (
    <main className="tv-stage">
      <div className="tv-symbol tv-symbol-star" />
      <div className="tv-symbol tv-symbol-ring" />
      <div className="tv-symbol tv-symbol-bolt" />

      <section className="tv-hero" aria-label="Group Crash room">
        <div>
          <LogoMark size="tv" />
          <p className="tv-kicker">Second-screen party lobby</p>
        </div>
        <RoomCodePill code={room.roomCode} />
      </section>

      <section className="tv-layout" aria-label="Live lobby">
        <aside className="tv-join">
          <QrCard
            roomCode={room.roomCode}
            joinUrl="groupcrash.app/join/K7P4"
          />
          <EmptyGameCard
            title="No games added yet"
            subtitle="The host will choose from this shelf once games are installed."
            icon={<Gamepad2 aria-hidden="true" />}
          />
          <div className="tv-local-actions" aria-label="Local lobby controls">
            <p aria-live="polite">{notice}</p>
            <div className="tv-mode-switch">
              <Button
                disabled={!nextPreviewPlayer || room.players.length >= room.maxPlayers}
                onClick={addPreviewPlayer}
                variant="secondary"
              >
                Join
              </Button>
              <Button onClick={removePreviewPlayer} variant="secondary">
                Leave
              </Button>
              <Button onClick={sendPreviewShout} variant="secondary">
                Shout
              </Button>
              <Button
                disabled={Boolean(room.activeHostVote)}
                onClick={requestPreviewHost}
                variant="secondary"
              >
                Host
              </Button>
              <Button
                disabled={!room.activeHostVote}
                onClick={castPreviewYesVote}
                variant="primary"
              >
                Vote
              </Button>
              <Button onClick={resetPreviewRoom} variant="secondary">
                Reset
              </Button>
            </div>
          </div>
        </aside>

        <section className="tv-players panel" aria-label="Connected players">
          <div className="panel-heading">
            <div>
              <Badge tone="yellow" icon={<UsersRound aria-hidden="true" />}>
                {room.playerCount}/{room.maxPlayers} joined
              </Badge>
              <h1>Crash Crew</h1>
            </div>
            {host ? (
              <div className="host-callout" aria-label={`Current host is ${host.name}`}>
                <ChessAvatar avatar={host.avatar} selected size="sm" />
                <span>{host.name} calls the shots</span>
              </div>
            ) : null}
          </div>

          <div className="player-grid">
            {room.players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        </section>

        <aside className="tv-activity">
          <div className="panel activity-panel">
            <div className="panel-heading compact">
              <Badge tone="cream" icon={<MessageCircle aria-hidden="true" />}>
                Live shouts
              </Badge>
              <StatusPill status="connected">Room is live</StatusPill>
            </div>
            <div className="message-stack" aria-label="Lobby messages">
              {visibleMessages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>
          </div>

          <div className="panel candidates-panel">
            <div className="panel-heading compact">
              <Badge tone="yellow" icon={<Vote aria-hidden="true" />}>
                Host queue
              </Badge>
            </div>
            <div className="candidate-list">
              {hostCandidates.map((player) => (
                <div className="candidate-chip" key={player.id}>
                  <ChessAvatar avatar={player.avatar} size="xs" />
                  <span>{player.name}</span>
                  <strong>wants host</strong>
                </div>
              ))}
            </div>
          </div>

          {room.activeHostVote ? (
            <HostVotePanel
              vote={room.activeHostVote}
              players={room.players}
              size="tv"
            />
          ) : null}
        </aside>
      </section>
    </main>
  );
}
