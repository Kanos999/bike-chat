import * as analytics from './analytics';
import { createMockApiClient } from './api/mockApiClient';
import { createRealApiClient } from './api/realApiClient';
import { ApiClient } from './api/types';
import { createMockBluetoothModule, MockBluetoothModule } from './bluetooth/mockBluetooth';
import { getRealBluetoothModule } from './bluetooth/realBluetooth';
import { BluetoothModule } from './bluetooth/types';
import { getRealIMUModule, createMockIMUModule } from './imu';
import { IMUModule } from './imu/types';
import { createMockLocationModule } from './location/mockLocation';
import { createRealLocationModule } from './location/realLocation';
import { LocationModule } from './location/types';
import { createMockVoiceModule } from './voice/mockVoiceModule';
import { createWebRTCVoiceModule } from './voice/webrtcVoiceModule';
import { VoiceModule } from './voice/types';

export interface Services {
  bluetooth: BluetoothModule;
  location: LocationModule;
  imu: IMUModule;
  voice: VoiceModule;
  apiClient: ApiClient;
  analytics: {
    startSession: () => void;
    onLocation: (loc: Parameters<typeof analytics.onLocation>[0]) => void;
    onIMUSample: (sample: Parameters<typeof analytics.onIMUSample>[0]) => void;
    endSession: typeof analytics.endSession;
    getLastSummary: typeof analytics.getLastSummary;
  };
}

const useRealApi = typeof __DEV__ !== 'undefined' && __DEV__;
const useRealLocation = typeof __DEV__ !== 'undefined' && __DEV__;
const useRealVoice = typeof __DEV__ !== 'undefined' && __DEV__;
const realIMU = getRealIMUModule();
const realBle = getRealBluetoothModule();

const bluetooth: BluetoothModule = realBle ?? createMockBluetoothModule();
const location = useRealLocation ? createRealLocationModule() : createMockLocationModule();
const imu: IMUModule = realIMU ?? createMockIMUModule();
const voice: VoiceModule = useRealVoice ? createWebRTCVoiceModule() : createMockVoiceModule();
const apiClient: ApiClient = useRealApi ? createRealApiClient() : createMockApiClient();

export const services: Services = {
  bluetooth,
  location,
  imu,
  voice,
  apiClient,
  analytics: {
    startSession: analytics.startSession,
    onLocation: analytics.onLocation,
    onIMUSample: analytics.onIMUSample,
    endSession: analytics.endSession,
    getLastSummary: analytics.getLastSummary,
  },
};

export const mockBluetooth = bluetooth as MockBluetoothModule;
