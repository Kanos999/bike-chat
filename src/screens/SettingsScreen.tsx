import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../state/store';

const SettingsScreen = () => {
  const { riderId, ridePreference } = useAppStore((state) => ({
    riderId: state.riderId,
    ridePreference: state.ridePreference,
  }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Rider ID</Text>
        <Text>{riderId}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Default Ride Preference</Text>
        <Text>{ridePreference ?? 'Not set (choose on Home)'}</Text>
      </View>
      <Text style={styles.helper}>
        Native settings such as Bluetooth, permissions, and headset bindings will live here in a
        future build.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    color: '#555',
  },
  helper: {
    marginTop: 10,
    color: '#444',
  },
});

export default SettingsScreen;
