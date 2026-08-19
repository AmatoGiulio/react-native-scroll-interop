// Metro config for the local-library example.
//
// The example consumes the library through a `file:..` dependency. Keep runtime peers pinned to
// the host app so Metro cannot load a second React / Expo module graph from the linked repo root.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { peerDependencies = {} } = require('../package.json');

const config = getDefaultConfig(__dirname);
const appNodeModules = path.resolve(__dirname, 'node_modules');
const libraryNodeModules = path.resolve(__dirname, '..', 'node_modules');

function libraryPackagePattern(packageName) {
  return new RegExp(
    path.resolve(libraryNodeModules, packageName).replace(/[\\/]/g, '[\\\\/]')
  );
}

const runtimePeers = Object.keys(peerDependencies);

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  ...runtimePeers.map(libraryPackagePattern),
];

config.resolver.nodeModulesPaths = [
  appNodeModules,
  libraryNodeModules,
];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ...Object.fromEntries(
    runtimePeers.map((packageName) => [
      packageName,
      path.resolve(appNodeModules, packageName),
    ])
  ),
  'react-native-scroll-interop': path.resolve(__dirname, '..'),
};

config.watchFolders = [path.resolve(__dirname, '..')];

module.exports = config;
