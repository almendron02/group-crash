import type { ReactNode } from "react";
import { Crown, ScanLine, Sparkles } from "lucide-react";
import type { ChessAvatar as ChessAvatarName, HostVote, LobbyMessage, PublicPlayer } from "@group-crash/protocol";
import { createQrMatrix } from "./qr";

const chessGlyphs: Record<ChessAvatarName, string> = {
  pawn: "♟",
  knight: "♞",
  bishop: "♝",
  rook: "♜",
  queen: "♛",
  king: "♚"
};

export function LogoMark({ size = "tv" }: { size?: "tv" | "phone" }) {
  return (
    <div className={`gc-logo gc-logo-${size}`} aria-label="Group Crash">
      <span>Group</span>
      <strong>Crash</strong>
    </div>
  );
}

interface ChessAvatarProps {
  avatar: ChessAvatarName;
  selected?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

export function ChessAvatar({ avatar, selected = false, size = "md" }: ChessAvatarProps) {
  return (
    <span
      className={`gc-avatar gc-avatar-${size}`}
      data-selected={selected}
      aria-label={`${avatar} avatar`}
      title={`${avatar} avatar`}
    >
      {chessGlyphs[avatar]}
    </span>
  );
}

interface ButtonProps {
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "destructive";
}

export function Button({
  children,
  disabled = false,
  icon,
  onClick,
  variant = "primary"
}: ButtonProps) {
  return (
    <button
      className={`gc-button gc-button-${variant}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon ? <span className="gc-button-icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

interface BadgeProps {
  children: ReactNode;
  icon?: ReactNode;
  tone?: "yellow" | "cream" | "red";
}

export function Badge({ children, icon, tone = "yellow" }: BadgeProps) {
  return (
    <span className={`gc-badge gc-badge-${tone}`}>
      {icon ? <span className="gc-badge-icon">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export function StatusPill({
  children,
  status
}: {
  children: ReactNode;
  status: "connected" | "disconnected";
}) {
  return (
    <span className={`gc-status gc-status-${status}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export function RoomCodePill({ code }: { code: string }) {
  return (
    <div className="gc-room-code" aria-label={`Room code ${code}`}>
      <span>Room</span>
      <strong>{code}</strong>
    </div>
  );
}

export function QrCard({ roomCode, joinUrl }: { roomCode: string; joinUrl: string }) {
  const qr = createQrMatrix(joinUrl);

  return (
    <section className="gc-qr-card" aria-label="Join room">
      <div className="gc-qr-header">
        <Badge tone="yellow" icon={<ScanLine aria-hidden="true" />}>
          Scan to join
        </Badge>
        <strong>{roomCode}</strong>
      </div>
      <div
        className="gc-qr"
        role="img"
        aria-label={`QR code for ${joinUrl}`}
        style={{ gridTemplateColumns: `repeat(${qr.size}, 1fr)` }}
      >
        {qr.modules.map((dark, index) => (
          <span key={index} data-on={dark} />
        ))}
      </div>
      <p>{joinUrl}</p>
    </section>
  );
}

export function PlayerCard({ player }: { player: PublicPlayer }) {
  return (
    <article className="gc-player-card" data-status={player.connectionStatus}>
      <ChessAvatar avatar={player.avatar} selected={player.isHost} size="lg" />
      <div className="gc-player-info">
        <strong>{player.name}</strong>
        <span>
          {player.isHost ? "Current host" : player.wantsHost ? "Wants host" : "Player"}
        </span>
      </div>
      {player.isHost ? (
        <span className="gc-crown" aria-label="Host">
          <Crown aria-hidden="true" />
        </span>
      ) : null}
    </article>
  );
}

export function ChatMessage({ message }: { message: LobbyMessage }) {
  return (
    <article className="gc-chat-message">
      <ChessAvatar avatar={message.avatar} size="xs" />
      <div>
        <strong>{message.playerName}</strong>
        <span>{message.text}</span>
      </div>
    </article>
  );
}

export function EmptyGameCard({
  icon,
  subtitle,
  title
}: {
  icon?: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="gc-empty-game">
      <span className="gc-empty-icon">{icon ?? <Sparkles aria-hidden="true" />}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

export function HostVotePanel({
  players,
  size = "tv",
  vote
}: {
  players: PublicPlayer[];
  size?: "tv" | "phone";
  vote: HostVote;
}) {
  const currentHost = players.find((player) => player.id === vote.currentHostPlayerId);
  const proposedHost = players.find((player) => player.id === vote.proposedHostPlayerId);
  const yesCount = vote.yesPlayerIds.length;
  const noCount = vote.noPlayerIds.length;
  const progress = Math.min(100, Math.round((yesCount / vote.requiredYesVotes) * 100));

  return (
    <section className={`gc-vote-panel gc-vote-panel-${size}`} aria-label="Host vote">
      <Badge tone="yellow" icon={<Crown aria-hidden="true" />}>
        Host vote
      </Badge>
      <div className="gc-vote-people">
        <span>{currentHost?.name ?? "No host"}</span>
        <strong>to</strong>
        <span>{proposedHost?.name ?? "New host"}</span>
      </div>
      <div className="gc-vote-progress" aria-label={`${yesCount} yes votes of ${vote.requiredYesVotes} required`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="gc-vote-counts">
        <strong>{yesCount} yes</strong>
        <span>{noCount} no</span>
        <span>{vote.requiredYesVotes} needed</span>
      </div>
    </section>
  );
}

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="gc-phone-shell">
      <div className="gc-phone-speaker" aria-hidden="true" />
      <div className="gc-phone-screen">{children}</div>
    </div>
  );
}
