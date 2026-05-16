import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elmapp.mobile',
  appName: 'ELM Mobile',
  webDir: 'renderer/out',
  server: {
    androidScheme: 'https'
  }
};

export default config;
