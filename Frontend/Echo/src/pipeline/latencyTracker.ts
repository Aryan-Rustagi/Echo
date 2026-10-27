export interface LatencyRecord {
  turnId: number;
  sttFinalTime: number;
  llmFirstTokenTime: number | null;
  firstAudioTime: number | null;
  sttToFirstTokenMs: number | null;
  sttToFirstAudioMs: number | null;
  tokenToAudioMs: number | null;
  timestamp: string;
}

export interface LatencyTrackerState {
  currentTurn: LatencyRecord | null;
  history: LatencyRecord[];
  averageFirstAudioMs: number | null;
  averageFirstTokenMs: number | null;
}

let turnCounter = 0;
let currentRecord: LatencyRecord | null = null;
const latencyHistory: LatencyRecord[] = [];
let listeners: Array<(state: LatencyTrackerState) => void> = [];

function emitState(): void {
  const state = getLatencyState();
  for (let i = 0; i < listeners.length; i += 1) {
    listeners[i](state);
  }
}

export function recordSttFinal(turnId?: number): number {
  turnCounter += 1;
  const id = turnId ?? turnCounter;
  const now = performance.now();
  currentRecord = {
    turnId: id,
    sttFinalTime: now,
    llmFirstTokenTime: null,
    firstAudioTime: null,
    sttToFirstTokenMs: null,
    sttToFirstAudioMs: null,
    tokenToAudioMs: null,
    timestamp: new Date().toLocaleTimeString(),
  };
  emitState();
  return id;
}

export function recordLlmFirstToken(): void {
  if (!currentRecord || currentRecord.llmFirstTokenTime !== null) {
    return;
  }
  const now = performance.now();
  currentRecord.llmFirstTokenTime = now;
  currentRecord.sttToFirstTokenMs = Math.round(now - currentRecord.sttFinalTime);
  emitState();
}

export function recordFirstAudio(): void {
  if (!currentRecord || currentRecord.firstAudioTime !== null) {
    return;
  }
  const now = performance.now();
  currentRecord.firstAudioTime = now;
  currentRecord.sttToFirstAudioMs = Math.round(now - currentRecord.sttFinalTime);
  if (currentRecord.llmFirstTokenTime !== null) {
    currentRecord.tokenToAudioMs = Math.round(now - currentRecord.llmFirstTokenTime);
  }
  latencyHistory.unshift({ ...currentRecord });
  if (latencyHistory.length > 30) {
    latencyHistory.pop();
  }
  emitState();
}

export function resetLatencyTracker(): void {
  currentRecord = null;
  latencyHistory.length = 0;
  emitState();
}

export function getLatencyState(): LatencyTrackerState {
  const completed = latencyHistory.filter(function hasAudio(r) {
    return r.sttToFirstAudioMs !== null;
  });

  const totalAudio = completed.reduce(function sum(acc, r) {
    return acc + (r.sttToFirstAudioMs || 0);
  }, 0);

  const totalTokens = completed.reduce(function sum(acc, r) {
    return acc + (r.sttToFirstTokenMs || 0);
  }, 0);

  return {
    currentTurn: currentRecord ? { ...currentRecord } : null,
    history: [...latencyHistory],
    averageFirstAudioMs: completed.length > 0 ? Math.round(totalAudio / completed.length) : null,
    averageFirstTokenMs: completed.length > 0 ? Math.round(totalTokens / completed.length) : null,
  };
}

export function subscribeLatency(listener: (state: LatencyTrackerState) => void): () => void {
  listeners.push(listener);
  listener(getLatencyState());
  return function unsubscribe() {
    listeners = listeners.filter(function remove(l) {
      return l !== listener;
    });
  };
}
