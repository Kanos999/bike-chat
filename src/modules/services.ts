import { createMockApiClient } from './api/mockApiClient';
import { ApiClient } from './api/types';
import { createMockBluetoothModule, MockBluetoothModule } from './bluetooth/mockBluetooth';
import { BluetoothModule } from './bluetooth/types';
import { createMockLocationModule } from './location/mockLocation';
import { LocationModule } from './location/types';
import { createMockVoiceModule } from './voice/mockVoiceModule';
import { VoiceModule } from './voice/types';

export interface Services {
  bluetooth: BluetoothModule;
  location: LocationModule;
  voice: VoiceModule;
  apiClient: ApiClient;
}

const bluetooth = createMockBluetoothModule();
const location = createMockLocationModule();
const voice = createMockVoiceModule();
const apiClient = createMockApiClient();

export const services: Services = {
  bluetooth,
  location,
  voice,
  apiClient,
};

export const mockBluetooth = bluetooth as MockBluetoothModule;
