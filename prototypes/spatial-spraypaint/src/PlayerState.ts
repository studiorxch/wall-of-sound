export type PlayerStatus = "empty" | "paused" | "playing";

export interface PlayerState {
  status: PlayerStatus;
  trackName: string;
  duration: number;
  currentTime: number;
  loop: boolean;
}

export type PlayerAction =
  | { type: "load"; trackName: string; duration?: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "time"; currentTime: number; duration: number }
  | { type: "seek"; currentTime: number }
  | { type: "toggle-loop" }
  | { type: "ended" };

export const INITIAL_PLAYER_STATE: PlayerState = {
  status: "empty",
  trackName: "No track loaded",
  duration: 0,
  currentTime: 0,
  loop: true,
};

export function reducePlayerState(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "load":
      return { ...state, status: "paused", trackName: action.trackName, duration: action.duration ?? 0, currentTime: 0 };
    case "play":
      return state.status === "empty" ? state : { ...state, status: "playing" };
    case "pause":
      return state.status === "empty" ? state : { ...state, status: "paused" };
    case "time":
      return { ...state, duration: Math.max(0, action.duration), currentTime: Math.max(0, action.currentTime) };
    case "seek":
      return { ...state, currentTime: Math.max(0, Math.min(state.duration, action.currentTime)) };
    case "toggle-loop":
      return { ...state, loop: !state.loop };
    case "ended":
      return state.loop ? { ...state, status: "playing", currentTime: 0 } : { ...state, status: "paused", currentTime: state.duration };
  }
}
