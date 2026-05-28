import './src/app/bootstrap';
import './global.css';
import { AppRegistry } from 'react-native';
import App from './src/app/App';

// When running on a physical device, point API to your machine's LAN IP (see src/config.ts):
(global as unknown as { __BikeChatApiBaseUrl?: string }).__BikeChatApiBaseUrl = 'http://192.168.0.79:3001';

AppRegistry.registerComponent('BikeChat', () => App);

export default App;
