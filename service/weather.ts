import api from './api';

export interface WeatherData {
  city?: string;
  locationName?: string;
  temperature?: number | string | null;
  humidity?: number | string | null;
  relativeHumidity?: number | string | null;
  condition?: string | null;
  iconUrl?: string | null;
}

export const getWeatherByLocation = async (
  lat: number,
  lon: number,
): Promise<WeatherData> => {
  const response = await api.get('/weather/current/?lat=\(lat)&lon=\(lon)', {
    params: { lat, lon }
  });

  return response.data.data;
};