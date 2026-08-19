// Metro config for the local-library example.
//
// The example consumes the library through a `file:..` dependency, which npm installs as a
// symlink. Runtime peers must always resolve from the example app, never from the linked library
// root, or Metro can load duplicate React / Expo Router module graphs.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const appNodeModules = path.resolve(__dirname, 'node_modules');
const libraryNodeModules = path.resolve(__dirname, '..', 'node_modules');

function blockLibraryPackage(packageName) {
  return new RegExp(
    path.resolve(libraryNodeModules, packageName).replace(/[\\/]/g, '[\\\\/]')
  );
}

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  blockLibraryPackage('react'),
  blockLibraryPackage('react-native'),
  blockLibraryPackage('expo-router'),
];

config.resolver.nodeModulesPaths = [
  appNodeModules,
  libraryNodeModules,
];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-router': path.resolve(appNodeModules, 'expo-router'),
  'react-native-scroll-interop': path.resolve(__dirname, '..'),
};

config.watchFolders = [path.resolve(__dirname, '..')];

module.exports = config;
