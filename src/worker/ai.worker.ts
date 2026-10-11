import { findBestMove, type SearchOptions } from '../engine/ai/search';
import { Position, type PositionSnapshot } from '../engine/position';

export interface AiRequest {
  id: number;
  snapshot: PositionSnapshot;
  options: SearchOptions;
}

export interface AiResponse {
  id: number;
  move: number | null;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, snapshot, options } = e.data;
  const pos = Position.fromSnapshot(snapshot);
  const r = findBestMove(pos, options);
  const response: AiResponse = { id, ...r };
  (self as unknown as Worker).postMessage(response);
};
