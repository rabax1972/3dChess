import type { SearchOptions } from '../engine/ai/search';
import type { Move } from '../engine/move';
import type { Position } from '../engine/position';
import type { AiRequest, AiResponse } from '../worker/ai.worker';

/**
 * Esegue l'IA in un Web Worker. Una nuova richiesta (o cancel) rende obsolete
 * le precedenti: se il worker è occupato viene terminato e ricreato, così
 * "annulla" e "nuova partita" non devono attendere la fine della ricerca.
 */
export class AiClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: { id: number; resolve: (r: AiResponse | null) => void } | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<AiResponse>) => {
        if (this.pending && e.data.id === this.pending.id) {
          const { resolve } = this.pending;
          this.pending = null;
          resolve(e.data);
        }
      };
    }
    return this.worker;
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  /** Chiede la mossa migliore. Risolve con null se la richiesta viene annullata. */
  think(pos: Position, options: SearchOptions): Promise<(AiResponse & { move: Move | null }) | null> {
    this.cancel();
    const id = this.nextId++;
    const request: AiRequest = { id, snapshot: pos.snapshot(), options };
    return new Promise((resolve) => {
      this.pending = { id, resolve };
      this.ensureWorker().postMessage(request);
    });
  }

  cancel() {
    if (!this.pending) return;
    const { resolve } = this.pending;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    resolve(null);
  }
}
