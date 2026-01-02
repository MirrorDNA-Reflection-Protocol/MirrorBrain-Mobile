const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration for MirrorBrain Mobile
 * Added .pte and .bin extensions for ExecuTorch models
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
    resolver: {
        assetExts: [...defaultConfig.resolver.assetExts, 'pte', 'bin'],
    },
};

module.exports = mergeConfig(defaultConfig, config);
