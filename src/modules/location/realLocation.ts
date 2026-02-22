import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation, { type GeolocationResponse } from '@react-native-community/geolocation';
import type { Location, LocationModule } from './types';

async function requestAndroidLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location for rides',
        message: 'Bike Chat needs your location to show you on the map and connect you with nearby riders.',
        buttonNeutral: 'Ask later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    if (fine !== PermissionsAndroid.RESULTS.GRANTED) return false;
    const coarse = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      {
        title: 'Location for rides',
        message: 'Bike Chat needs location access for ride presence.',
        buttonNeutral: 'Ask later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return coarse === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export const createRealLocationModule = (): LocationModule => {
  let watchId: number | null = null;

  const startTracking = async (onLocation: (loc: Location) => void): Promise<void> => {
    if (watchId != null) return;

    const reportPosition = (position: GeolocationResponse): void => {
      const { latitude, longitude, speed, heading } = position.coords;
      const loc: Location = {
        lat: latitude,
        lon: longitude,
        speedKph: speed != null && !Number.isNaN(speed) ? speed * 3.6 : null,
        headingDeg: heading != null && !Number.isNaN(heading) ? heading : null,
      };
      onLocation(loc);
    };

    // Get an initial fix ASAP (cached or quick). Physical devices often delay watchPosition
    // or never fire indoors; without this, lastLocation stays null and no presence is sent.
    Geolocation.getCurrentPosition(
      reportPosition,
      (err) => console.warn('[geolocation] getCurrentPosition', err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );

    watchId = Geolocation.watchPosition(
      reportPosition,
      (err) => console.warn('[geolocation] watchPosition', err),
      { enableHighAccuracy: true, distanceFilter: 10 }
    );
  };

  const stopTracking = async (): Promise<void> => {
    if (watchId != null) {
      Geolocation.clearWatch(watchId);
      watchId = null;
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    const androidOk = await requestAndroidLocationPermission();
    if (!androidOk) return false;
    return new Promise((resolve) => {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false)
      );
    });
  };

  return {
    startTracking,
    stopTracking,
    requestPermissions,
  };
};
