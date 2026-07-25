import type { GameContext, GroupCrashGame } from "@group-crash/game-sdk";

export interface DemoCrashState {
  phase: "placeholder";
  roomCode: string;
  selectedAt: number;
}

export type DemoCrashAction = never;

export const demoCrashGame: GroupCrashGame<DemoCrashState, DemoCrashAction> = {
  manifest: {
    id: "demo-crash",
    name: "Demo Crash",
    tagline: "Registry test module",
    description:
      "A non-playable shell that proves the host can select a game module before real games are installed.",
    minPlayers: 1,
    maxPlayers: 8,
    status: "shell"
  },
  createInitialState(context: GameContext) {
    return {
      phase: "placeholder",
      roomCode: context.roomCode,
      selectedAt: Date.now()
    };
  },
  handlePlayerAction(state) {
    return { state, events: [] };
  },
  getTvView(state) {
    return state;
  },
  getPlayerView(state) {
    return state;
  }
};

export const demoCrashManifest = demoCrashGame.manifest;
