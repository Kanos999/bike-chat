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

const globals = global as unknown as {
  __BikeChatUseMockApi?: boolean;
  __BikeChatUseMockLocation?: boolean;
  __BikeChatUseMockVoice?: boolean;
};

// Default to real implementations in all builds.
// Opt into mocks explicitly via globals for demos/tests.
const useRealApi = !globals.__BikeChatUseMockApi;
const useRealLocation = !globals.__BikeChatUseMockLocation;
const useRealVoice = !globals.__BikeChatUseMockVoice;
const realIMU = getRealIMUModule();
const realBle = getRealBluetoothModule();

const bluetooth: BluetoothModule = realBle ?? createMockBluetoothModule();
const location = useRealLocation ? createRealLocationModule() : createMockLocationModule();
const imu: IMUModule = realIMU ?? createMockIMUModule();
const voice: VoiceModule = useRealVoice ? createWebRTCVoiceModule() : createMockVoiceModule();
const apiClient: ApiClient = useRealApi ? createRealApiClient() : createMockApiClient();

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // eslint-disable-next-line no-console
  console.log('[services] api=', useRealApi ? 'real' : 'mock');
  // eslint-disable-next-line no-console
  console.log('[services] location=', useRealLocation ? 'real' : 'mock');
  // eslint-disable-next-line no-console
  console.log('[services] voice=', useRealVoice ? 'real' : 'mock');
}

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
