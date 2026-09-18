const appJson = require("./app.json");

module.exports = () => {
  const expo = appJson.expo;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || expo.extra.apiUrl;
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || expo.extra.googleMapsApiKey;

  return {
    ...expo,
    extra: {
      ...expo.extra,
      apiUrl,
      googleMapsApiKey,
    },
    plugins: expo.plugins.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "react-native-maps") {
        return [plugin[0], { ...plugin[1], androidGoogleMapsApiKey: googleMapsApiKey }];
      }
      return plugin;
    }),
  };
};