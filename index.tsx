import 'react-native-gesture-handler';
import './src/app/polyfills';
import './src/app/bootstrap';
import './global.css';
import { AppRegistry } from 'react-native';
import App from './src/app/App';

// Deployed backend on Fly.io. The client derives WebSocket URLs by swapping the
// scheme, so /ws and /presence/subscribe automatically run over wss://.
// For local backend testing on a physical device, swap this for your LAN IP, e.g.
// 'http://192.168.0.79:3001'.
(global as unknown as { __BikeChatApiBaseUrl?: string }).__BikeChatApiBaseUrl = 'https://bike-chat.fly.dev';

AppRegistry.registerComponent('BikeChat', () => App);

export default App;
