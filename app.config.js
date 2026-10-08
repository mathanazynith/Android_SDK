const appJson = require("./app.json");
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = () => {
  const expo = appJson.expo;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || expo.extra.apiUrl;
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || expo.extra.googleMapsApiKey;

  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile: "./google-services.json",
    },
    extra: {
      ...expo.extra,
      apiUrl,
      googleMapsApiKey,
    },
    plugins: [
      (config) =>
        withAndroidManifest(config, (manifestConfig) => {
          const application = manifestConfig.modResults.manifest.application?.[0];
          const channelMetadata = application?.["meta-data"]?.find(
            (metadata) =>
              metadata.$?.["android:name"] ===
              "com.google.firebase.messaging.default_notification_channel_id"
          );

          if (!channelMetadata) {
            throw new Error("Firebase default notification channel metadata was not found.");
          }

          channelMetadata.$["tools:replace"] = "android:value";
          return manifestConfig;
        }),
      ...expo.plugins.map((plugin) => {
        if (Array.isArray(plugin) && plugin[0] === "react-native-maps") {
          return [plugin[0], { ...plugin[1], androidGoogleMapsApiKey: googleMapsApiKey }];
        }
        return plugin;
      }),
    ],
  };
};