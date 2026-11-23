import { Alert } from '@/components/ThemedAlert';
import { Linking } from 'react-native';

export const LEGAL_PAGE_URL = 'https://zyrun.in/legal/privacy-policy';

export async function openLegalPage() {
  try {
    await Linking.openURL(LEGAL_PAGE_URL);
  } catch (error) {
    console.error('[LegalLinks] Could not open legal page:', error);
    Alert.alert('Unable to open page', 'Please try again later.');
  }
}
