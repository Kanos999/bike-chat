export type IntercomState =
  | 'DISABLED'
  | 'IDLE'
  | 'OPEN'
  | 'MUTED_LOCAL'
  | 'MUTED_GLOBAL';

export interface VoiceModule {
  init(): Promise<void>;
  joinChannel(channelId: string): Promise<void>;
  leaveChannel(): Promise<void>;
  setLocalMute(muted: boolean): Promise<void>;
  setGlobalMute(muted: boolean): Promise<void>;
  getState(): IntercomState;
  onStateChange(listener: (state: IntercomState) => void): () => void;
  /** Subscribe to input (mic) level 0–1 for visualizer. Returns unsubscribe. */
  subscribeToInputLevel?(callback: (level: number) => void): () => void;
}
