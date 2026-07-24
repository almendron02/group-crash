import { useMemo, useState } from "react";
import { Gamepad2, MessageCircle, UsersRound, Vote } from "lucide-react";
import {
  mockRoomSnapshot,
  mockVoteRoomSnapshot,
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

export function App() {
  const [mode, setMode] = useState<TvMode>("lobby");

  const room = useMemo<RoomSnapshot>(
    () => (mode === "vote" ? mockVoteRoomSnapshot : mockRoomSnapshot),
    [mode]
  );

  const host = room.players.find((player) => player.id === room.hostPlayerId);
  const hostCandidates = room.players.filter(
    (player) => player.wantsHost && !player.isHost
  );

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
          <div className="tv-mode-switch" aria-label="Prototype state">
            <Button
              variant={mode === "lobby" ? "primary" : "secondary"}
              onClick={() => setMode("lobby")}
            >
              Live lobby
            </Button>
            <Button
              variant={mode === "vote" ? "primary" : "secondary"}
              onClick={() => setMode("vote")}
            >
              Vote state
            </Button>
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
              {room.messages.map((message) => (
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

