import { RiderBeacon } from '../modules/bluetooth/types';
import { ChannelMemberSummary } from '../modules/api/types';
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
export type MatchedRider = ChannelMemberSummary;

export type VoiceRuntimeState = {
  intercomState: IntercomState;
  localMuted: boolean;
  globalMuted: boolean;
};

export interface RideSessionHandles {
  presenceTimeout?: NodeJS.Timeout;
  channelPollTimeout?: NodeJS.Timeout;
  controlSocket?: WebSocket;
  controlReconnectTimeout?: NodeJS.Timeout;
  unsubscribeHeadset?: () => void;
  unsubscribeHelmet?: () => void;
  unsubscribeAudioRoute?: () => void;
  unsubscribeVoice?: () => void;
  unsubscribeVoicePeers?: () => void;
  stopLocation?: () => Promise<void>;
  stopIMU?: () => Promise<void>;
  stopScanning?: () => Promise<void>;
  stopAdvertising?: () => Promise<void>;
}
