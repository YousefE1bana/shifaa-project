import { Stack } from 'expo-router';
import React from 'react';
import { PatientLocaleProvider } from '../src/locale-context';

export default function PatientLayout() {
  return (
    <PatientLocaleProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </PatientLocaleProvider>
  );
}
