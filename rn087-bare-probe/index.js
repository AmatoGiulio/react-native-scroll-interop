import {AppRegistry} from 'react-native';
import App from './App';
import AppLifecycle from './AppLifecycle';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerComponent('RN087NestedScrollLifecycleProbe', () => AppLifecycle);
