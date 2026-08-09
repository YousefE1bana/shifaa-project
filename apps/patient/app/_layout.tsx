import { Stack } from 'expo-router';
import React from 'react';

export default function PatientLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
