const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  punycode: require.resolve("punycode/"),
};

module.exports = withNativewind(config, {
  // inline variables break PlatformColor in CSS variables
  inlineVariables: false,
});
