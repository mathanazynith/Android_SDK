// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Remove or comment out react-native-dotenv for now
      // ['module:react-native-dotenv', {
      //   moduleName: '@env',
      //   path: '.env',
      // }],
    ],
  };
};