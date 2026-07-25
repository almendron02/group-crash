import { useEffect, useMemo, useState } from "react";
import { Gamepad2, MessageCircle, UsersRound, Vote } from "lucide-react";
import {
  createEmptyRoomSnapshot,
  type RoomCreatedPayload,
  type RoomSnapshot,
  type ServerEvent
} from "@group-crash/protocol";
import {
  Badge,
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

type ConnectionStatus = "connecting" | "connected" | "disconnected";

function getInitialRoomCode() {
  if (typeof window === "undefined") {
    return null;
  }

  const roomCode = new URLSearchParams(window.location.search).get("room");
  return roomCode?.trim().toUpperCase() || null;
}

function getSocketUrl() {
  const configuredUrl = import.meta.env.VITE_GROUP_CRASH_WS_URL as string | undefined;

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

function getControllerJoinUrl(roomCode: string) {
  const configuredUrl = import.meta.env.VITE_GROUP_CRASH_CONTROLLER_URL as string | undefined;
  const origin = configuredUrl || `${window.location.protocol}//${window.location.hostname}:5174`;
  return `${origin}/?room=${roomCode}`;
}

export function App() {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [createdRoom, setCreatedRoom] = useState<RoomCreatedPayload | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);

  useEffect(() => {
    const socket = new WebSocket(getSocketUrl());
    const initialRoomCode = getInitialRoomCode();

    socket.addEventListener("open", () => {
      setConnectionStatus("connected");
      socket.send(
        JSON.stringify(
          initialRoomCode
            ? { type: "room.watch", payload: { roomCode: initialRoomCode } }
            : { type: "room.create", payload: {} }
        )
      );
    });

    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;

      if (event.type === "room.created") {
        setCreatedRoom(event.payload);
        return;
      }

      if (event.type === "room.snapshot") {
        setRoom(event.payload);
        return;
      }

      if (event.type === "room.closed") {
        setCreatedRoom(null);
        setRoom(null);
        socket.send(JSON.stringify({ type: "room.create", payload: {} }));
        return;
      }

      if (event.type === "error" && event.payload.code === "ROOM_NOT_FOUND") {
        socket.send(JSON.stringify({ type: "room.create", payload: {} }));
      }
    });

    socket.addEventListener("close", () => setConnectionStatus("disconnected"));
    socket.addEventListener("error", () => setConnectionStatus("disconnected"));

    return () => socket.close();
  }, []);

  const displayRoom = useMemo(
    () =>
      room ??
      createEmptyRoomSnapshot({
        roomCode: createdRoom?.roomCode ?? "----",
        roomId: createdRoom?.roomId ?? "pending"
      }),
    [createdRoom, room]
  );
  const roomCode = displayRoom.roomCode;
  const joinUrl = createdRoom?.joinUrl ?? getControllerJoinUrl(roomCode);
  const host = displayRoom.players.find(
    (player) => player.id === displayRoom.hostPlayerId
  );
  const hostCandidates = displayRoom.players.filter(
    (player) => player.wantsHost && !player.isHost
  );
  const selectedGame = displayRoom.availableGames.find(
    (game) => game.id === displayRoom.selectedGameId
  );
  const visibleMessages = [...displayRoom.messages]
    .slice(displayRoom.activeHostVote ? -3 : -8)
    .reverse();
  const roomIsLive = connectionStatus === "connected";

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
        <RoomCodePill code={roomCode} />
      </section>

      <section className="tv-layout" aria-label="Live lobby">
        <aside className="tv-join">
          <QrCard
            roomCode={roomCode}
            joinUrl={joinUrl}
          />
          {selectedGame ? (
            <section className="tv-game-module" aria-label="Selected game">
              <span className="tv-game-icon">
                <Gamepad2 aria-hidden="true" />
              </span>
              <div>
                <Badge tone="yellow">Selected module</Badge>
                <h2>{selectedGame.name}</h2>
                <p>{selectedGame.tagline}</p>
                <small>
                  {selectedGame.status === "shell"
                    ? "Placeholder screen only"
                    : `${selectedGame.minPlayers}-${selectedGame.maxPlayers} players`}
                </small>
              </div>
            </section>
          ) : (
            <EmptyGameCard
              title={displayRoom.gamesAvailable ? "Pick a game shell" : "No games added yet"}
              subtitle={
                displayRoom.gamesAvailable
                  ? "The host can select a registered module from their phone."
                  : "The host will choose from this shelf once games are installed."
              }
              icon={<Gamepad2 aria-hidden="true" />}
            />
          )}
        </aside>

        <section className="tv-players panel" aria-label="Connected players">
          <div className="panel-heading">
            <div>
              <Badge tone="yellow" icon={<UsersRound aria-hidden="true" />}>
                {displayRoom.playerCount}/{displayRoom.maxPlayers} joined
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
            {displayRoom.players.map((player) => (
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
              <StatusPill status={roomIsLive ? "connected" : "disconnected"}>
                {roomIsLive ? "Room is live" : "Connecting"}
              </StatusPill>
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

          {displayRoom.activeHostVote ? (
            <HostVotePanel
              vote={displayRoom.activeHostVote}
              players={displayRoom.players}
              size="tv"
            />
          ) : null}
        </aside>
      </section>
    </main>
  );
}
