export interface GameManifest {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameContext {
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

