import { Stack } from 'expo-router';
import React from 'react';
import { useEffect } from 'react';
import { registerServiceWorker } from '../pwa/registerServiceWorker';

export default function RootLayout() {
  useEffect(() => {
    registerServiceWorker().catch((error: unknown) => {
      console.error('Service worker registration failed', error);
    });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
