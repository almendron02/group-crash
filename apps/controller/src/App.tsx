import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Crown,
  DoorOpen,
  Eye,
  Gamepad2,
  Lock,
  MessageCircle,
  Palette,
  Play,
  Send,
  ShieldAlert,
  Trophy,
  Unlock,
  UserPlus,
  UserX,
  Volume2,
  VolumeX,
  Vote
} from "lucide-react";
import {
  avatarOptions,
  quickMessageOptions,
  type ChessAvatar,
  type ClientEvent,
  type PlayerSessionPayload,
  type PrivateGameView,
  type PublicPlayer,
  type RoomSnapshot,
  type ServerEvent,
  type SketchPoint,
  type SketchStroke
} from "@group-crash/protocol";
import {
  Badge,
  Button,
  ChessAvatar as ChessAvatarBadge,
  EmptyGameCard,
  HostVotePanel,
  LogoMark,
  PhoneShell,
  StatusPill
} from "@group-crash/ui";

type Screen = "name" | "avatar" | "role" | "player" | "host" | "vote" | "game";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

const storageKey = "group-crash-player-session";

function getInitialRoomCode() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
}

function getSocketUrl() {
  const configuredUrl = import.meta.env.VITE_GROUP_CRASH_WS_URL as string | undefined;
  const serverUrl = import.meta.env.VITE_GROUP_CRASH_SERVER_URL as string | undefined;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (serverUrl) {
    const url = new URL(serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString().replace(/\/$/, "");
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

function readStoredSession() {
  const rawSession = window.localStorage.getItem(storageKey);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as PlayerSessionPayload;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>("name");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [privateGame, setPrivateGame] = useState<PrivateGameView | null>(null);
  const [playerSession, setPlayerSession] = useState<PlayerSessionPayload | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [roomCode, setRoomCode] = useState(getInitialRoomCode);
  const [playerName, setPlayerName] = useState("Maya");
  const [avatar, setAvatar] = useState<ChessAvatar>("queen");
  const [wantsHost, setWantsHost] = useState(false);
  const [sentMessage, setSentMessage] = useState("Ready!");
  const [feedback, setFeedback] = useState("Connect to a TV room to join.");
  const [passTargetPlayerId, setPassTargetPlayerId] = useState("");

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let activeSocket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (stopped || reconnectTimeout) {
        return;
      }

      setConnectionStatus("disconnected");
      setSocket(null);
      setFeedback("Connection lost. Reconnecting...");
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, 1000);
    };

    const connect = () => {
      const webSocket = new WebSocket(getSocketUrl());
      activeSocket = webSocket;
      const initialRoomCode = getInitialRoomCode();
      const storedSession = readStoredSession();

      setSocket(webSocket);
      setConnectionStatus("connecting");

      webSocket.addEventListener("open", () => {
        if (activeSocket !== webSocket) {
          return;
        }

        setConnectionStatus("connected");

        if (
          storedSession &&
          (!initialRoomCode || storedSession.roomCode === initialRoomCode)
        ) {
          setHasJoined(true);
          setPlayerSession(storedSession);
          setRoomCode(storedSession.roomCode);
          setFeedback("Reconnecting to your room...");
          sendWithSocket(webSocket, {
            type: "room.reconnect",
            payload: storedSession
          });
        } else {
          setFeedback("Connected. Enter your player info.");
        }
      });

      webSocket.addEventListener("message", (message) => {
        const event = JSON.parse(String(message.data)) as ServerEvent;

        if (event.type === "player.session") {
          window.localStorage.setItem(storageKey, JSON.stringify(event.payload));
          setPlayerSession(event.payload);
          setRoomCode(event.payload.roomCode);
          setHasJoined(true);
          setFeedback("Joined the room.");
          return;
        }

        if (event.type === "room.snapshot") {
          setRoom(event.payload);
          return;
        }

        if (event.type === "room.closed") {
          window.localStorage.removeItem(storageKey);
          setHasJoined(false);
          setPlayerSession(null);
          setRoom(null);
          setPrivateGame(null);
          setFeedback("Room closed. Ask the TV for the new room code.");
          setScreen("name");
          return;
        }

        if (event.type === "game.private_state") {
          setPrivateGame(event.payload);
          return;
        }

        if (event.type === "game.selected") {
          setFeedback("Game module selected.");
          return;
        }

        if (event.type === "game.started") {
          setFeedback("Game started.");
          return;
        }

        if (event.type === "game.updated") {
          setFeedback("Game updated.");
          return;
        }

        if (
          event.type === "player.kicked" &&
          event.payload.targetPlayerId === readStoredSession()?.playerId
        ) {
          window.localStorage.removeItem(storageKey);
          setHasJoined(false);
          setPlayerSession(null);
          setRoom(null);
          setPrivateGame(null);
          setFeedback("The host removed you from the room.");
          setScreen("name");
          return;
        }

        if (
          event.type === "player.muted" &&
          event.payload.targetPlayerId === readStoredSession()?.playerId
        ) {
          setFeedback(event.payload.isMuted ? "The host muted your shouts." : "You can send shouts again.");
          return;
        }

        if (event.type === "room.settings.updated") {
          setFeedback(
            event.payload.isLocked
              ? `Room locked at ${event.payload.maxPlayers} players.`
              : `Room open at ${event.payload.maxPlayers} players.`
          );
          return;
        }

        if (event.type === "error") {
          setFeedback(event.payload.message);
        }
      });

      webSocket.addEventListener("close", () => {
        if (activeSocket === webSocket) {
          scheduleReconnect();
        }
      });
      webSocket.addEventListener("error", () => {
        if (activeSocket !== webSocket) {
          return;
        }

        setConnectionStatus("disconnected");
        setFeedback("Could not reach the lobby server. Reconnecting...");
        webSocket.close();
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      activeSocket?.close();
    };
  }, []);

  const currentHost = room?.players.find((player) => player.isHost);

  const currentPlayer = useMemo(
    () =>
      room?.players.find((player) => player.id === playerSession?.playerId) ?? {
        id: playerSession?.playerId ?? "pending-player",
        name: playerName.trim() || "Maya",
        avatar,
        connectionStatus: connectionStatus === "connected" ? "connected" as const : "disconnected" as const,
        isHost: false,
        wantsHost,
        isMuted: false,
        joinedAt: Date.now()
      },
    [avatar, connectionStatus, playerName, playerSession, room?.players, wantsHost]
  );

  useEffect(() => {
    if (!hasJoined || !playerSession || !room) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === playerSession.playerId);

    if (!player) {
      return;
    }

    if (room.activeGame) {
      setScreen("game");
      return;
    }

    if (room.activeHostVote?.eligiblePlayerIds.includes(player.id)) {
      setScreen("vote");
      return;
    }

    if (player.isHost) {
      setScreen("host");
      return;
    }

    setScreen("player");
  }, [hasJoined, playerSession, room]);

  const passTargets = useMemo(
    () =>
      room?.players.filter(
        (player) =>
          player.id !== playerSession?.playerId &&
          player.connectionStatus === "connected"
      ) ?? [],
    [playerSession?.playerId, room?.players]
  );

  useEffect(() => {
    if (passTargets.length === 0) {
      setPassTargetPlayerId("");
      return;
    }

    if (!passTargets.some((player) => player.id === passTargetPlayerId)) {
      setPassTargetPlayerId(passTargets[0].id);
    }
  }, [passTargetPlayerId, passTargets]);

  function sendEvent(event: ClientEvent) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setFeedback("Controller is not connected to the server yet.");
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  }

  function finishJoin() {
    const normalizedRoomCode = roomCode.trim().toUpperCase();

    if (!normalizedRoomCode) {
      setFeedback("Enter the room code shown on the TV.");
      setScreen("name");
      return;
    }

    const sent = sendEvent({
      type: "room.join",
      payload: {
        avatar,
        name: playerName,
        roomCode: normalizedRoomCode,
        wantsHost
      }
    });

    if (sent) {
      setRoomCode(normalizedRoomCode);
      setFeedback("Joining room...");
    }
  }

  function sendSelectedMessage() {
    if (!playerSession) {
      setFeedback("Join the room before sending a shout.");
      return;
    }

    sendEvent({
      type: "message.send",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        text: sentMessage
      }
    });
  }

  function requestHostFromPhone() {
    if (!playerSession) {
      setFeedback("Join the room before requesting host.");
      return;
    }

    sendEvent({
      type: "host.request",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function castPhoneVote(vote: "yes" | "no") {
    if (!playerSession || !room?.activeHostVote) {
      setFeedback("No host vote is active.");
      return;
    }

    sendEvent({
      type: "host.vote.cast",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        vote,
        voteId: room.activeHostVote.id
      }
    });
  }

  function passHostFromPhone() {
    if (!playerSession) {
      setFeedback("Join the room before passing host.");
      return;
    }

    if (!passTargetPlayerId) {
      setFeedback("Choose who should become host first.");
      return;
    }

    sendEvent({
      type: "host.pass",
      payload: {
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        targetPlayerId: passTargetPlayerId
      }
    });
  }

  function updateRoomSettingsFromPhone(settings: {
    isLocked?: boolean;
    maxPlayers?: number;
  }) {
    if (!playerSession) {
      setFeedback("Join the room before changing room controls.");
      return;
    }

    sendEvent({
      type: "room.settings.update",
      payload: {
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        ...settings
      }
    });
  }

  function kickPlayerFromPhone(targetPlayerId: string) {
    if (!playerSession) {
      setFeedback("Join the room before removing players.");
      return;
    }

    sendEvent({
      type: "player.kick",
      payload: {
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        targetPlayerId
      }
    });
  }

  function mutePlayerFromPhone(targetPlayerId: string, isMuted: boolean) {
    if (!playerSession) {
      setFeedback("Join the room before muting players.");
      return;
    }

    sendEvent({
      type: "player.mute",
      payload: {
        hostPlayerId: playerSession.playerId,
        isMuted,
        roomCode: playerSession.roomCode,
        targetPlayerId
      }
    });
  }

  function selectGameFromPhone(gameId: string) {
    if (!playerSession) {
      setFeedback("Join the room before selecting a game.");
      return;
    }

    sendEvent({
      type: "game.select",
      payload: {
        gameId,
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function startGameFromPhone() {
    if (!playerSession) {
      setFeedback("Join the room before starting a game.");
      return;
    }

    sendEvent({
      type: "game.start",
      payload: {
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function advanceGameFromPhone(
    action: "start_voting" | "start_guessing" | "show_results" | "return_lobby"
  ) {
    if (!playerSession) {
      setFeedback("Join the room before advancing a game.");
      return;
    }

    sendEvent({
      type: "game.advance",
      payload: {
        action,
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function castGameVoteFromPhone(targetPlayerId: string) {
    if (!playerSession) {
      setFeedback("Join the room before voting.");
      return;
    }

    sendEvent({
      type: "game.vote.cast",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        targetPlayerId
      }
    });
  }

  function sendSketchStrokeFromPhone(points: SketchPoint[]) {
    if (!playerSession) {
      setFeedback("Join the room before drawing.");
      return;
    }

    sendEvent({
      type: "game.sketch.stroke",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        stroke: {
          color: "#291313",
          points,
          size: 7
        }
      }
    });
  }

  function submitSketchGuessFromPhone(guess: string) {
    if (!playerSession) {
      setFeedback("Join the room before guessing.");
      return;
    }

    sendEvent({
      type: "game.sketch.guess",
      payload: {
        guess,
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function leaveRoomFromPhone() {
    if (!playerSession) {
      setFeedback("You are not in a room right now.");
      setScreen("name");
      return;
    }

    const leavingRoomCode = playerSession.roomCode;

    sendEvent({
      type: "room.leave",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });

    window.localStorage.removeItem(storageKey);
    setHasJoined(false);
    setPlayerSession(null);
    setRoom(null);
    setPrivateGame(null);
    setPassTargetPlayerId("");
    setWantsHost(false);
    setRoomCode(leavingRoomCode);
    setFeedback("Left the room. You can join again whenever.");
    setScreen("name");
  }

  return (
    <main className="controller-stage">
      <PhoneShell>
        {screen === "name" ? (
          <section className="phone-card join-card">
            <LogoMark size="phone" />
            <Badge tone="yellow">
              {roomCode ? `Room ${roomCode}` : "Room code"}
            </Badge>
            <div className="phone-copy">
              <h1>Step into the crash.</h1>
              <p>Pick the name the TV will show when you join the lobby.</p>
            </div>
            <label className="field-label" htmlFor="room-code">
              Room code
            </label>
            <input
              id="room-code"
              className="text-input"
              maxLength={4}
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
            <label className="field-label" htmlFor="player-name">
              Display name
            </label>
            <input
              id="player-name"
              className="text-input"
              maxLength={16}
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
            <p className="phone-feedback" aria-live="polite">
              {feedback}
            </p>
            <Button
              disabled={connectionStatus !== "connected"}
              variant="primary"
              icon={<UserPlus aria-hidden="true" />}
              onClick={() => setScreen("avatar")}
            >
              Continue
            </Button>
          </section>
        ) : null}

        {screen === "avatar" ? (
          <section className="phone-card">
            <div className="phone-header-row">
              <Badge tone="cream">Choose avatar</Badge>
              <StatusPill
                status={connectionStatus === "connected" ? "connected" : "disconnected"}
              >
                {connectionStatus === "connected" ? roomCode || "Live" : "Offline"}
              </StatusPill>
            </div>
            <div className="phone-copy">
              <h1>Pick your piece.</h1>
              <p>Chess-piece avatars keep the lobby bold and readable.</p>
            </div>
            <div className="avatar-grid" aria-label="Chess avatars">
              {avatarOptions.map((option) => (
                <button
                  className="avatar-choice"
                  data-selected={avatar === option}
                  key={option}
                  onClick={() => setAvatar(option)}
                >
                  <ChessAvatarBadge
                    avatar={option}
                    selected={avatar === option}
                    size="md"
                  />
                  <span>{option}</span>
                </button>
              ))}
            </div>
            <div className="phone-actions split">
              <Button variant="secondary" onClick={() => setScreen("name")}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setScreen("role")}>
                Continue
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "role" ? (
          <section className="phone-card">
            <div className="phone-header-row">
              <Badge tone="cream">Join options</Badge>
              <ChessAvatarBadge avatar={avatar} selected size="sm" />
            </div>
            <div className="phone-copy">
              <h1>How are you joining?</h1>
              <p>If more players want host, the room can vote to change it.</p>
            </div>
            <div className="role-stack">
              <button
                className="role-option"
                data-selected={!wantsHost}
                onClick={() => setWantsHost(false)}
              >
                <span>Join as player</span>
                <small>Send messages, vote, and play when games arrive.</small>
              </button>
              <button
                className="role-option"
                data-selected={wantsHost}
                onClick={() => setWantsHost(true)}
              >
                <span>Request host</span>
                <small>Ask for control of game selection and lobby flow.</small>
              </button>
            </div>
            <div className="phone-actions split">
              <Button variant="secondary" onClick={() => setScreen("avatar")}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<DoorOpen aria-hidden="true" />}
                onClick={finishJoin}
              >
                Join room
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "player" ? (
          <LobbyController
            player={currentPlayer}
            hostName={currentHost?.name ?? "Waiting"}
            feedback={feedback}
            roomCode={roomCode}
            sentMessage={sentMessage}
            setSentMessage={setSentMessage}
            onLeaveRoom={leaveRoomFromPhone}
            onRequestHost={requestHostFromPhone}
            onSendMessage={sendSelectedMessage}
            voteActive={Boolean(room?.activeHostVote)}
          />
        ) : null}

        {screen === "host" ? (
          <HostController
            player={currentPlayer}
            feedback={feedback}
            passTargetPlayerId={passTargetPlayerId}
            passTargets={passTargets}
            room={room}
            sentMessage={sentMessage}
            setPassTargetPlayerId={setPassTargetPlayerId}
            setSentMessage={setSentMessage}
            onKickPlayer={kickPlayerFromPhone}
            onLeaveRoom={leaveRoomFromPhone}
            onMutePlayer={mutePlayerFromPhone}
            onSelectGame={selectGameFromPhone}
            onSendMessage={sendSelectedMessage}
            onStartGame={startGameFromPhone}
            onPassHost={passHostFromPhone}
            onUpdateRoomSettings={updateRoomSettingsFromPhone}
          />
        ) : null}

        {screen === "vote" ? (
          <VoteController
            player={currentPlayer}
            feedback={feedback}
            room={room}
            onLeaveRoom={leaveRoomFromPhone}
            onVoteYes={() => castPhoneVote("yes")}
            onVoteNo={() => castPhoneVote("no")}
          />
        ) : null}

        {screen === "game" ? (
          <GameController
            feedback={feedback}
            isHost={Boolean(currentPlayer.isHost)}
            player={currentPlayer}
            privateGame={privateGame}
            room={room}
            onLeaveRoom={leaveRoomFromPhone}
            onReturnLobby={() => advanceGameFromPhone("return_lobby")}
            onShowResults={() => advanceGameFromPhone("show_results")}
            onSketchGuess={submitSketchGuessFromPhone}
            onSketchStroke={sendSketchStrokeFromPhone}
            onStartGuessing={() => advanceGameFromPhone("start_guessing")}
            onStartVoting={() => advanceGameFromPhone("start_voting")}
            onVote={castGameVoteFromPhone}
          />
        ) : null}
      </PhoneShell>
    </main>
  );
}

function sendWithSocket(socket: WebSocket, event: ClientEvent) {
  socket.send(JSON.stringify(event));
}

interface LobbyControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
    isMuted?: boolean;
  };
  feedback: string;
  hostName: string;
  roomCode: string;
  sentMessage: string;
  setSentMessage: (message: string) => void;
  onLeaveRoom: () => void;
  onRequestHost: () => void;
  onSendMessage: () => void;
  voteActive: boolean;
}

function LobbyController({
  feedback,
  player,
  hostName,
  roomCode,
  sentMessage,
  setSentMessage,
  onLeaveRoom,
  onRequestHost,
  onSendMessage,
  voteActive
}: LobbyControllerProps) {
  return (
    <section className="phone-card lobby-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Room {roomCode}</span>
        </div>
        <StatusPill status="connected">Live</StatusPill>
      </div>

      <div className="host-summary">
        <Badge tone="yellow" icon={<Crown aria-hidden="true" />}>
          {hostName} is host
        </Badge>
        <p>Only the host can choose games. The room can vote to switch.</p>
      </div>

      <QuickMessageControls
        disabled={Boolean(player.isMuted)}
        sentMessage={sentMessage}
        setSentMessage={setSentMessage}
        onSendMessage={onSendMessage}
      />

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>

      <div className="phone-actions split">
        <Button
          disabled={voteActive}
          variant="primary"
          icon={<Vote aria-hidden="true" />}
          onClick={onRequestHost}
        >
          Request host
        </Button>
        <Button variant="destructive" onClick={onLeaveRoom}>
          Leave room
        </Button>
      </div>
    </section>
  );
}

interface HostControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  feedback: string;
  passTargetPlayerId: string;
  passTargets: PublicPlayer[];
  room: RoomSnapshot | null;
  sentMessage: string;
  setPassTargetPlayerId: (playerId: string) => void;
  setSentMessage: (message: string) => void;
  onLeaveRoom: () => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onMutePlayer: (targetPlayerId: string, isMuted: boolean) => void;
  onSelectGame: (gameId: string) => void;
  onSendMessage: () => void;
  onStartGame: () => void;
  onPassHost: () => void;
  onUpdateRoomSettings: (settings: { isLocked?: boolean; maxPlayers?: number }) => void;
}

function HostController({
  feedback,
  passTargetPlayerId,
  passTargets,
  player,
  room,
  sentMessage,
  setPassTargetPlayerId,
  setSentMessage,
  onKickPlayer,
  onLeaveRoom,
  onMutePlayer,
  onSelectGame,
  onPassHost,
  onSendMessage,
  onStartGame,
  onUpdateRoomSettings
}: HostControllerProps) {
  const games = room?.availableGames ?? [];
  const selectedGame = games.find((game) => game.id === room?.selectedGameId);
  const controlTargets =
    room?.players.filter((candidate) => candidate.id !== room.hostPlayerId) ?? [];
  const selectedGameCanStart =
    Boolean(selectedGame) &&
    selectedGame?.status === "playable" &&
    (room?.playerCount ?? 0) >= (selectedGame?.minPlayers ?? 99);

  return (
    <section className="phone-card lobby-card host-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Current host</span>
        </div>
        <Badge tone="yellow" icon={<Crown aria-hidden="true" />}>
          Host
        </Badge>
      </div>

      <div className="game-registry-card">
        <div className="section-label">
          <Gamepad2 aria-hidden="true" />
          <span>Game modules</span>
        </div>
        {games.length > 0 ? (
          <div className="game-module-stack">
            {games.map((game) => (
              <button
                className="game-module-option"
                data-selected={game.id === room?.selectedGameId}
                key={game.id}
                onClick={() => onSelectGame(game.id)}
              >
                <span>{game.name}</span>
                <small>{game.tagline}</small>
                <strong>
                  {game.status === "shell"
                    ? "Shell"
                    : `${game.minPlayers}-${game.maxPlayers} players`}
                </strong>
              </button>
            ))}
          </div>
        ) : (
          <EmptyGameCard
            title="No games added yet"
            subtitle="This shelf will hold playable game modules after the lobby is live."
            icon={<Gamepad2 aria-hidden="true" />}
          />
        )}
        <p>
          {selectedGame
            ? selectedGame.status === "playable"
              ? `${selectedGame.name} is selected. Start when enough players are connected.`
              : `${selectedGame.name} is a shell and cannot start yet.`
            : "Select a playable game module to start a round."}
        </p>
      </div>

      <QuickMessageControls
        sentMessage={sentMessage}
        setSentMessage={setSentMessage}
        onSendMessage={onSendMessage}
      />

      <div className="room-controls-card">
        <div className="section-label">
          {room?.isLocked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
          <span>Room controls</span>
        </div>
        <div className="room-control-row">
          <label htmlFor="room-capacity">Capacity</label>
          <select
            id="room-capacity"
            className="target-select"
            value={room?.maxPlayers ?? 8}
            onChange={(event) =>
              onUpdateRoomSettings({ maxPlayers: Number(event.target.value) })
            }
          >
            {[2, 3, 4, 5, 6, 7, 8].map((capacity) => (
              <option
                disabled={capacity < (room?.playerCount ?? 0)}
                key={capacity}
                value={capacity}
              >
                {capacity} players
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            icon={room?.isLocked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
            onClick={() => onUpdateRoomSettings({ isLocked: !room?.isLocked })}
          >
            {room?.isLocked ? "Unlock" : "Lock"}
          </Button>
        </div>

        <div className="moderation-list">
          {controlTargets.map((target) => (
            <div className="moderation-row" key={target.id}>
              <ChessAvatarBadge avatar={target.avatar} size="xs" />
              <div>
                <strong>{target.name}</strong>
                <span>
                  {target.connectionStatus}
                  {target.isMuted ? " / muted" : ""}
                </span>
              </div>
              <button
                className="mini-control-button"
                onClick={() => onMutePlayer(target.id, !target.isMuted)}
              >
                {target.isMuted ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
                <span>{target.isMuted ? "Unmute" : "Mute"}</span>
              </button>
              <button
                className="mini-control-button danger"
                onClick={() => onKickPlayer(target.id)}
              >
                <UserX aria-hidden="true" />
                <span>Kick</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pass-host-card">
        <div className="section-label">
          <Crown aria-hidden="true" />
          <span>Pass host to</span>
        </div>
        <select
          className="target-select"
          disabled={passTargets.length === 0}
          value={passTargetPlayerId}
          onChange={(event) => setPassTargetPlayerId(event.target.value)}
        >
          {passTargets.length === 0 ? (
            <option value="">No players available</option>
          ) : null}
          {passTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
      </div>

      <div className="host-controls">
        <Button
          variant="primary"
          disabled={!selectedGameCanStart}
          icon={<Play aria-hidden="true" />}
          onClick={onStartGame}
        >
          Start game
        </Button>
        <Button
          disabled={passTargets.length === 0}
          variant="secondary"
          onClick={onPassHost}
        >
          Pass host
        </Button>
      </div>
      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>
      <Button variant="destructive" onClick={onLeaveRoom}>
        Leave room
      </Button>
    </section>
  );
}

interface QuickMessageControlsProps {
  disabled?: boolean;
  sentMessage: string;
  setSentMessage: (message: string) => void;
  onSendMessage: () => void;
}

function QuickMessageControls({
  disabled = false,
  sentMessage,
  setSentMessage,
  onSendMessage
}: QuickMessageControlsProps) {
  return (
    <div className="quick-message-card">
      <div className="section-label">
        <MessageCircle aria-hidden="true" />
        <span>Quick messages</span>
      </div>
      <div className="quick-grid">
        {quickMessageOptions.slice(0, 4).map((message) => (
          <button
            className="quick-message-button"
            key={message}
            disabled={disabled}
            data-selected={sentMessage === message}
            onClick={() => setSentMessage(message)}
          >
            {message}
          </button>
        ))}
      </div>
      <Button
        disabled={disabled}
        variant="secondary"
        icon={<Send aria-hidden="true" />}
        onClick={onSendMessage}
      >
        Send to TV
      </Button>
    </div>
  );
}

interface VoteControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  feedback: string;
  room: RoomSnapshot | null;
  onLeaveRoom: () => void;
  onVoteYes: () => void;
  onVoteNo: () => void;
}

function VoteController({
  feedback,
  player,
  room,
  onLeaveRoom,
  onVoteYes,
  onVoteNo
}: VoteControllerProps) {
  const activeVote = room?.activeHostVote;

  return (
    <section className="phone-card lobby-card vote-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Host vote active</span>
        </div>
      </div>

      {activeVote ? (
        <HostVotePanel vote={activeVote} players={room?.players ?? []} size="phone" />
      ) : (
        <div className="host-summary">
          <Badge tone="yellow">No vote active</Badge>
          <p>Request host to open a room vote.</p>
        </div>
      )}

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>

      <div className="phone-actions split">
        <Button disabled={!activeVote} variant="secondary" onClick={onVoteNo}>
          Vote no
        </Button>
        <Button disabled={!activeVote} variant="primary" onClick={onVoteYes}>
          Vote yes
        </Button>
      </div>
      <Button variant="destructive" onClick={onLeaveRoom}>
        Leave room
      </Button>
    </section>
  );
}

interface GameControllerProps {
  feedback: string;
  isHost: boolean;
  player: PublicPlayer;
  privateGame: PrivateGameView | null;
  room: RoomSnapshot | null;
  onLeaveRoom: () => void;
  onReturnLobby: () => void;
  onShowResults: () => void;
  onSketchGuess: (guess: string) => void;
  onSketchStroke: (points: SketchPoint[]) => void;
  onStartGuessing: () => void;
  onStartVoting: () => void;
  onVote: (targetPlayerId: string) => void;
}

function GameController({
  feedback,
  isHost,
  player,
  privateGame,
  room,
  onLeaveRoom,
  onReturnLobby,
  onShowResults,
  onSketchGuess,
  onSketchStroke,
  onStartGuessing,
  onStartVoting,
  onVote
}: GameControllerProps) {
  const activeGame = room?.activeGame;

  if (activeGame?.gameId === "sketch-crash") {
    return (
      <SketchGameController
        activeGame={activeGame}
        feedback={feedback}
        isHost={isHost}
        player={player}
        privateGame={privateGame}
        room={room}
        onLeaveRoom={onLeaveRoom}
        onReturnLobby={onReturnLobby}
        onShowResults={onShowResults}
        onSketchGuess={onSketchGuess}
        onSketchStroke={onSketchStroke}
        onStartGuessing={onStartGuessing}
      />
    );
  }

  const results = activeGame?.results ?? privateGame?.results ?? null;
  const imposter = room?.players.find(
    (candidate) => candidate.id === results?.imposterPlayerId
  );
  const votedTarget = room?.players.find(
    (candidate) => candidate.id === privateGame?.votedForPlayerId
  );
  const voteTargets =
    room?.players.filter(
      (candidate) =>
        candidate.id !== player.id &&
        candidate.connectionStatus === "connected" &&
        activeGame?.playerIds.includes(candidate.id)
    ) ?? [];

  return (
    <section className="phone-card game-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>{activeGame?.name ?? "Game loading"}</span>
        </div>
        <Badge tone="yellow" icon={<ShieldAlert aria-hidden="true" />}>
          {activeGame?.phase ?? "sync"}
        </Badge>
      </div>

      <div className="role-card" data-role={privateGame?.role ?? "waiting"}>
        <div className="section-label">
          <Eye aria-hidden="true" />
          <span>Your clue</span>
        </div>
        {privateGame ? (
          <>
            <strong>
              {privateGame.role === "imposter" ? "You are the imposter" : "You are crew"}
            </strong>
            <p>Category: {privateGame.category}</p>
            {privateGame.secretWord ? (
              <h2>{privateGame.secretWord}</h2>
            ) : (
              <h2>Blend in</h2>
            )}
          </>
        ) : (
          <>
            <strong>Waiting for private role</strong>
            <p>The server is sending your hidden information.</p>
          </>
        )}
      </div>

      {activeGame?.phase === "discussion" ? (
        <div className="game-phase-card">
          <Badge tone="cream">Discussion</Badge>
          <p>
            Talk out loud. Crew knows the word; the imposter only knows the category.
          </p>
          {isHost ? (
            <Button variant="primary" icon={<Vote aria-hidden="true" />} onClick={onStartVoting}>
              Start voting
            </Button>
          ) : (
            <p className="phone-feedback">Waiting for host to open voting.</p>
          )}
        </div>
      ) : null}

      {activeGame?.phase === "voting" ? (
        <div className="game-phase-card">
          <Badge tone="cream">
            {activeGame.votesCast}/{activeGame.votesNeeded} voted
          </Badge>
          <p>{votedTarget ? `Your vote: ${votedTarget.name}` : "Pick who you think is the imposter."}</p>
          <div className="vote-target-stack">
            {voteTargets.map((target) => (
              <button
                className="vote-target-button"
                data-selected={privateGame?.votedForPlayerId === target.id}
                key={target.id}
                disabled={!privateGame?.canVote}
                onClick={() => onVote(target.id)}
              >
                <ChessAvatarBadge avatar={target.avatar} size="xs" />
                <span>{target.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeGame?.phase === "results" && results ? (
        <div className="game-phase-card result-card">
          <Badge tone="yellow" icon={<Trophy aria-hidden="true" />}>
            {results.winner === "crew" ? "Crew wins" : "Imposter wins"}
          </Badge>
          <h2>{imposter?.name ?? "The imposter"}</h2>
          <p>Secret word: {results.secretWord}</p>
          {isHost ? (
            <Button variant="primary" onClick={onReturnLobby}>
              Return lobby
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>
      <Button variant="destructive" onClick={onLeaveRoom}>
        Leave room
      </Button>
    </section>
  );
}

interface SketchGameControllerProps {
  activeGame: NonNullable<RoomSnapshot["activeGame"]>;
  feedback: string;
  isHost: boolean;
  player: PublicPlayer;
  privateGame: PrivateGameView | null;
  room: RoomSnapshot | null;
  onLeaveRoom: () => void;
  onReturnLobby: () => void;
  onShowResults: () => void;
  onSketchGuess: (guess: string) => void;
  onSketchStroke: (points: SketchPoint[]) => void;
  onStartGuessing: () => void;
}

function SketchGameController({
  activeGame,
  feedback,
  isHost,
  player,
  privateGame,
  room,
  onLeaveRoom,
  onReturnLobby,
  onShowResults,
  onSketchGuess,
  onSketchStroke,
  onStartGuessing
}: SketchGameControllerProps) {
  const [guess, setGuess] = useState("");
  const drawer = room?.players.find(
    (candidate) => candidate.id === activeGame.drawerPlayerId
  );
  const submittedGuess = privateGame?.submittedGuess ?? null;
  const correctGuessNames =
    activeGame.results?.correctPlayerIds
      ?.map((playerId) => room?.players.find((candidate) => candidate.id === playerId)?.name)
      .filter(Boolean)
      .join(", ") || "No one";

  function submitGuess() {
    const trimmed = guess.trim();

    if (!trimmed) {
      return;
    }

    onSketchGuess(trimmed);
    setGuess("");
  }

  return (
    <section className="phone-card game-card sketch-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>{activeGame.name}</span>
        </div>
        <Badge tone="yellow" icon={<Palette aria-hidden="true" />}>
          {activeGame.phase}
        </Badge>
      </div>

      <div className="role-card sketch-role-card" data-role={privateGame?.role ?? "waiting"}>
        <div className="section-label">
          <Eye aria-hidden="true" />
          <span>{privateGame?.role === "drawer" ? "Your prompt" : "Your mission"}</span>
        </div>
        {privateGame?.role === "drawer" ? (
          <>
            <strong>You draw for the room</strong>
            <p>Category: {privateGame.category}</p>
            <h2>{privateGame.prompt ?? privateGame.secretWord}</h2>
          </>
        ) : (
          <>
            <strong>{drawer?.name ?? "Someone"} is drawing</strong>
            <p>Category: {activeGame.category}</p>
            <h2>{activeGame.drawingPromptHint ?? "Watch TV"}</h2>
          </>
        )}
      </div>

      <DrawingPad
        canDraw={Boolean(privateGame?.canDraw)}
        strokes={activeGame.strokes ?? []}
        onStroke={onSketchStroke}
      />

      {activeGame.phase === "drawing" ? (
        <div className="game-phase-card">
          <Badge tone="cream">Drawing</Badge>
          <p>
            {privateGame?.canDraw
              ? "Draw on this pad. Every finished stroke appears on the TV."
              : "Watch the TV while the drawer sketches the prompt."}
          </p>
          {isHost ? (
            <Button variant="primary" icon={<Send aria-hidden="true" />} onClick={onStartGuessing}>
              Open guesses
            </Button>
          ) : null}
        </div>
      ) : null}

      {activeGame.phase === "guessing" ? (
        <div className="game-phase-card">
          <Badge tone="cream">
            {activeGame.guessesSubmitted ?? 0}/{activeGame.guessesNeeded ?? 0} guesses
          </Badge>
          {privateGame?.role === "guesser" ? (
            <>
              <p>{submittedGuess ? `Your guess: ${submittedGuess}` : "Type the secret prompt."}</p>
              <input
                className="text-input sketch-guess-input"
                disabled={!privateGame.canGuess}
                maxLength={40}
                placeholder="Your guess"
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
              />
              <Button
                disabled={!privateGame.canGuess || guess.trim().length === 0}
                variant="primary"
                onClick={submitGuess}
              >
                Lock guess
              </Button>
            </>
          ) : (
            <p>Guessers are locking answers on their phones.</p>
          )}
          {isHost ? (
            <Button variant="secondary" onClick={onShowResults}>
              Show results
            </Button>
          ) : null}
        </div>
      ) : null}

      {activeGame.phase === "results" && activeGame.results ? (
        <div className="game-phase-card result-card">
          <Badge tone="yellow" icon={<Trophy aria-hidden="true" />}>
            {activeGame.results.winner === "guessers" ? "Guessers win" : "Drawer wins"}
          </Badge>
          <h2>{activeGame.results.prompt}</h2>
          <p>Correct: {correctGuessNames}</p>
          {isHost ? (
            <Button variant="primary" onClick={onReturnLobby}>
              Return lobby
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>
      <Button variant="destructive" onClick={onLeaveRoom}>
        Leave room
      </Button>
    </section>
  );
}

function DrawingPad({
  canDraw,
  onStroke,
  strokes
}: {
  canDraw: boolean;
  onStroke: (points: SketchPoint[]) => void;
  strokes: SketchStroke[];
}) {
  const [currentPoints, setCurrentPoints] = useState<SketchPoint[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  function getPoint(event: PointerEvent<SVGSVGElement>): SketchPoint {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (!canDraw) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrentPoints([getPoint(event)]);
  }

  function continueStroke(event: PointerEvent<SVGSVGElement>) {
    if (!canDraw || currentPoints.length === 0) {
      return;
    }

    const nextPoint = getPoint(event);
    const lastPoint = currentPoints[currentPoints.length - 1];
    const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);

    if (distance < 0.01) {
      return;
    }

    setCurrentPoints((points) => [...points, nextPoint].slice(-80));
  }

  function finishStroke() {
    if (currentPoints.length >= 2) {
      onStroke(currentPoints);
    }

    setCurrentPoints([]);
  }

  return (
    <div className="sketch-pad-shell">
      <svg
        ref={svgRef}
        aria-label={canDraw ? "Drawing pad" : "Round sketch"}
        className="sketch-pad"
        role="img"
        viewBox="0 0 100 100"
        onPointerCancel={finishStroke}
        onPointerDown={startStroke}
        onPointerLeave={finishStroke}
        onPointerMove={continueStroke}
        onPointerUp={finishStroke}
      >
        <rect height="100" rx="7" width="100" x="0" y="0" />
        {strokes.map((stroke) => (
          <polyline
            fill="none"
            key={stroke.id}
            points={pointsToPolyline(stroke.points)}
            stroke={stroke.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={stroke.size / 2}
          />
        ))}
        {currentPoints.length > 0 ? (
          <polyline
            fill="none"
            points={pointsToPolyline(currentPoints)}
            stroke="#e62727"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
        ) : null}
      </svg>
      <span>{canDraw ? "Draw here" : "Read-only sketch"}</span>
    </div>
  );
}

function pointsToPolyline(points: SketchPoint[]) {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
}
