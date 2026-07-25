import { useEffect, useMemo, useState } from "react";
import {
  Gamepad2,
  MessageCircle,
  ShieldAlert,
  Trophy,
  UsersRound,
  Vote
} from "lucide-react";
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
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let stopped = false;
    const initialRoomCode = getInitialRoomCode();

    const sendRoomRequest = (activeSocket: WebSocket) => {
      activeSocket.send(
        JSON.stringify(
          initialRoomCode
            ? { type: "room.watch", payload: { roomCode: initialRoomCode } }
            : { type: "room.create", payload: {} }
        )
      );
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimeout) {
        return;
      }

      setConnectionStatus("disconnected");
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, 1000);
    };

    const connect = () => {
      setConnectionStatus("connecting");
      const activeSocket = new WebSocket(getSocketUrl());
      socket = activeSocket;

      activeSocket.addEventListener("open", () => {
        if (socket !== activeSocket) {
          return;
        }

        setConnectionStatus("connected");
        sendRoomRequest(activeSocket);
      });

      activeSocket.addEventListener("message", (message) => {
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

          if (!initialRoomCode && activeSocket.readyState === WebSocket.OPEN) {
            activeSocket.send(JSON.stringify({ type: "room.create", payload: {} }));
          }

          return;
        }

        if (
          event.type === "error" &&
          event.payload.code === "ROOM_NOT_FOUND" &&
          activeSocket.readyState === WebSocket.OPEN
        ) {
          activeSocket.send(JSON.stringify({ type: "room.create", payload: {} }));
        }
      });

      activeSocket.addEventListener("close", () => {
        if (socket === activeSocket) {
          scheduleReconnect();
        }
      });
      activeSocket.addEventListener("error", () => {
        if (socket !== activeSocket) {
          return;
        }

        setConnectionStatus("disconnected");
        activeSocket.close();
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      socket?.close();
    };
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
  const joinUrl = getControllerJoinUrl(roomCode);
  const host = displayRoom.players.find(
    (player) => player.id === displayRoom.hostPlayerId
  );
  const hostCandidates = displayRoom.players.filter(
    (player) => player.wantsHost && !player.isHost
  );
  const availableGames = displayRoom.availableGames ?? [];
  const selectedGame = availableGames.find(
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

      {displayRoom.activeGame ? (
        <ImposterTvGame room={displayRoom} />
      ) : (
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
              title={availableGames.length > 0 ? "Pick a game shell" : "No games added yet"}
              subtitle={
                availableGames.length > 0
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
      )}
    </main>
  );
}

function ImposterTvGame({ room }: { room: RoomSnapshot }) {
  const game = room.activeGame;

  if (!game) {
    return null;
  }

  const playerById = new Map(room.players.map((player) => [player.id, player]));
  const imposter = game.results
    ? playerById.get(game.results.imposterPlayerId)
    : null;

  return (
    <section className="tv-game-layout" aria-label="Imposter game">
      <section className="tv-game-main panel">
        <div className="panel-heading">
          <div>
            <Badge tone="yellow" icon={<ShieldAlert aria-hidden="true" />}>
              {game.phase}
            </Badge>
            <h1>{game.name}</h1>
          </div>
          <div className="tv-game-category">
            <span>Category</span>
            <strong>{game.category}</strong>
          </div>
        </div>

        <div className="tv-game-prompt">
          {game.phase === "discussion" ? (
            <>
              <h2>Talk it out.</h2>
              <p>
                Crew players know the secret word. The imposter only knows the category.
              </p>
            </>
          ) : null}
          {game.phase === "voting" ? (
            <>
              <h2>Vote on phones.</h2>
              <p>
                {game.votesCast}/{game.votesNeeded} votes are locked in.
              </p>
            </>
          ) : null}
          {game.phase === "results" && game.results ? (
            <>
              <h2>{game.results.winner === "crew" ? "Crew wins" : "Imposter wins"}</h2>
              <p>
                {imposter?.name ?? "The imposter"} was the imposter. Secret word:
                {" "}
                {game.results.secretWord}
              </p>
            </>
          ) : null}
        </div>
      </section>

      <aside className="tv-game-side">
        <div className="panel tv-game-roster">
          <div className="panel-heading compact">
            <Badge tone="cream" icon={<UsersRound aria-hidden="true" />}>
              Players
            </Badge>
          </div>
          <div className="tv-game-player-list">
            {game.playerIds.map((playerId) => {
              const player = playerById.get(playerId);
              const voteState = game.voteProgress.find(
                (progress) => progress.playerId === playerId
              );

              return player ? (
                <div className="tv-game-player" key={player.id}>
                  <ChessAvatar
                    avatar={player.avatar}
                    selected={game.results?.imposterPlayerId === player.id}
                    size="sm"
                  />
                  <span>{player.name}</span>
                  <strong>
                    {game.phase === "voting"
                      ? voteState?.hasVoted
                        ? "voted"
                        : "thinking"
                      : game.phase}
                  </strong>
                </div>
              ) : null;
            })}
          </div>
        </div>

        {game.phase === "results" && game.results ? (
          <div className="panel tv-game-results">
            <Badge tone="yellow" icon={<Trophy aria-hidden="true" />}>
              Results
            </Badge>
            {game.results.voteCounts.map((count) => {
              const player = playerById.get(count.playerId);

              return player ? (
                <div className="tv-vote-row" key={count.playerId}>
                  <span>{player.name}</span>
                  <strong>{count.votes}</strong>
                </div>
              ) : null;
            })}
          </div>
        ) : null}
      </aside>
    </section>
  );
}
