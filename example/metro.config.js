// Metro config for the local-library example.
//
// The example consumes the library through a `file:..` dependency, which npm installs as a
// symlink. Metro must therefore watch the parent folder and must NOT resolve a second copy of
// react / react-native from it, or the app would load two React instances.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve('..', 'node_modules', 'react').replace(/\\/g, '\\\\')),
  new RegExp(path.resolve('..', 'node_modules', 'react-native').replace(/\\/g, '\\\\')),
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, './node_modules'),
  path.resolve(__dirname, '../node_modules'),
];

config.resolver.extraNodeModules = {
  'expo-material-toolbar': path.resolve(__dirname, '..'),
};

config.watchFolders = [path.resolve(__dirname, '..')];

module.exports = config;
