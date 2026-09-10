// env.js
import Constants from 'expo-constants';

// Get environment variables from app.config.js extra
const config = Constants.expoConfig?.extra || {};

console.log('📦 Config loaded:', {
  hasApiUrl: !!config.apiUrl,
  hasGoogleKey: !!config.googleMapsApiKey,
  keyLength: config.googleMapsApiKey?.length || 0,
});

const ENV = {
  API_URL: config.apiUrl || 'https://zyrun.zynith-it.com',
  GOOGLE_MAPS_API_KEY: config.googleMapsApiKey || 'AIzaSyCbfFEhN28i6_DmvgUdRN6FUH9UVaTJoAk',
  GOOGLE_WEB_CLIENT_ID: config.googleWebClientId || '',
  GOOGLE_ANDROID_CLIENT_ID: config.googleAndroidClientId || '',
};

export default ENV;