const {getDefaultConfig} = require('@react-native/metro-config');
const path = require('path');
const {peerDependencies = {}} = require('../../package.json');

const config = getDefaultConfig(__dirname);
const appNodeModules = path.resolve(__dirname, 'node_modules');
const libraryRoot = path.resolve(__dirname, '..', '..');
const libraryNodeModules = path.resolve(libraryRoot, 'node_modules');

function libraryPackagePattern(packageName) {
  return new RegExp(
    path.resolve(libraryNodeModules, packageName).replace(/[\\/]/g, '[\\\\/]'),
  );
}

const runtimePeers = Object.keys(peerDependencies);

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  ...runtimePeers.map(libraryPackagePattern),
];

config.resolver.nodeModulesPaths = [appNodeModules, libraryNodeModules];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ...Object.fromEntries(
    runtimePeers.map(packageName => [
      packageName,
      path.resolve(appNodeModules, packageName),
    ]),
  ),
  'react-native-scroll-interop': libraryRoot,
};

config.watchFolders = [libraryRoot];

module.exports = config;
