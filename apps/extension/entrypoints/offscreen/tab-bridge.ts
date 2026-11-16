import type { GuestMessage, MediaState, Participant } from "@watchalong/protocol";

export interface TabBridgeOptions {
  onMediaState: (state: MediaState) => void;
  onViewport: (viewport: { width: number; height: number }) => void;
  getRoster: () => Participant[];
}

/**
 * Link between the host engine and the content scripts running in the shared tab.
 * M1: no content script yet, so this only defines the interface the engine uses.
 */
export class TabBridge {
  constructor(
    readonly tabId: number,
    readonly options: TabBridgeOptions,
  ) {}

  deliverGuestMessage(_guest: Participant, _message: GuestMessage): void {}
  guestGone(_guestId: string): void {}
  setRoster(_roster: Participant[]): void {}
  setDrawing(_drawing: boolean): void {}
  dispose(): void {}
}
