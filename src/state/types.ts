import { RiderBeacon } from '../modules/bluetooth/types';
import { IntercomState } from '../modules/voice/types';

export type RideMode =
  | 'IDLE'
  | 'INITIALISING'
  | 'ACTIVE_OPEN'
  | 'ACTIVE_FRIENDS_ONLY'
  | 'SUSPENDED'
  | 'ENDED';

export type RidePreference = 'OPEN' | 'FRIENDS_ONLY';

export type NearbyRider = RiderBeacon;

export type VoiceRuntimeState = {
  intercomState: IntercomState;
  localMuted: boolean;
  globalMuted: boolean;
};

export interface RideSessionHandles {
  presenceInterval?: NodeJS.Timeout;
  channelInterval?: NodeJS.Timeout;
  unsubscribeHeadset?: () => void;
  unsubscribeHelmet?: () => void;
  unsubscribeVoice?: () => void;
  stopLocation?: () => Promise<void>;
  stopScanning?: () => Promise<void>;
  stopAdvertising?: () => Promise<void>;
}
