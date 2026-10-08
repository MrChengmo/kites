import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';
const config: CapacitorConfig = {
  appId: 'app.kites.mobile',
  appName: 'Kites',
  webDir: 'dist',
  backgroundColor: '#ffffff',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#ffffff' },
  plugins: { Keyboard: { resize: KeyboardResize.Native, resizeOnFullScreen: true } },
  server: { androidScheme: 'https' },
};
export default config;
