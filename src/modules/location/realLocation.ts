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

    const androidExtraOptions =
      Platform.OS === 'android'
        ? ({ showLocationDialog: true, forceRequestLocation: true } as any)
        : {};

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
      (err) => {
        console.warn('[geolocation] getCurrentPosition', err);
        // If we didn't get a fast/cached fix, retry once with high accuracy and a longer timeout.
        // This helps on emulators and on devices that need to warm up GPS.
        if (err?.code === 2 || err?.code === 3) {
          Geolocation.getCurrentPosition(
            reportPosition,
            (err2) => console.warn('[geolocation] getCurrentPosition(highAccuracy)', err2),
            {
              enableHighAccuracy: true,
              timeout: 60000,
              maximumAge: 0,
              ...androidExtraOptions,
            } as any
          );
        }
      },
      {
        enableHighAccuracy: Platform.OS === 'android',
        timeout: 30000,
        maximumAge: 60000,
        ...androidExtraOptions,
      } as any
    );

    watchId = Geolocation.watchPosition(
      reportPosition,
      (err) => console.warn('[geolocation] watchPosition', err),
      ({ enableHighAccuracy: true, distanceFilter: 10, ...androidExtraOptions } as any)
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

    // `requestAuthorization` is iOS-only; on Android the runtime permission prompt above is sufficient.
    if (Platform.OS === 'android') return true;

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
