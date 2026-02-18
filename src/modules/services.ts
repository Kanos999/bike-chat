import * as analytics from './analytics';
import { createMockApiClient } from './api/mockApiClient';
import { ApiClient } from './api/types';
import { createMockBluetoothModule, MockBluetoothModule } from './bluetooth/mockBluetooth';
import { BluetoothModule } from './bluetooth/types';
import { createMockIMUModule } from './imu';
import { IMUModule } from './imu/types';
import { createMockLocationModule } from './location/mockLocation';
import { LocationModule } from './location/types';
import { createMockVoiceModule } from './voice/mockVoiceModule';
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

const bluetooth = createMockBluetoothModule();
const location = createMockLocationModule();
const imu = createMockIMUModule();
const voice = createMockVoiceModule();
const apiClient = createMockApiClient();

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
