export interface BoardHandle {
  /** Imperative camera: translate in board px, scale k. Both renderers must be cheap here. */
  setTransform: (x: number, y: number, k: number) => void;
  size: { width: number; height: number };
}
