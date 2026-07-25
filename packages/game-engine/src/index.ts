export type GameModuleStatus = "shell" | "playable" | "coming_soon";

export interface GameManifest {
  description: string;
  id: string;
  minPlayers: number;
  maxPlayers: number;
  name: string;
  status: GameModuleStatus;
  tagline: string;
}

export interface GameContext {
  hostPlayerId: string | null;
  roomCode: string;
  roomId: string;
  playerIds: string[];
}

export interface GameTransition<State = unknown> {
  state: State;
  events: unknown[];
}

export interface GroupCrashGame<State = unknown, Action = unknown> {
  manifest: GameManifest;
  createInitialState(context: GameContext): State;
  handlePlayerAction(state: State, action: Action, context: GameContext): GameTransition<State>;
  getTvView(state: State): unknown;
  getPlayerView(state: State, playerId: string): unknown;
}
