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
        message: 'Convoii needs your location to show you on the map and connect you with nearby riders.',
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
        message: 'Convoii needs location access for ride presence.',
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

    const requestCurrentPosition = (
      label: string,
      options: {
        enableHighAccuracy: boolean;
        timeout: number;
        maximumAge: number;
      },
      onError?: (err: { code: number; message: string }) => void
    ) => {
      Geolocation.getCurrentPosition(
        reportPosition,
        (err) => {
          console.warn(`[geolocation] ${label}`, err);
          onError?.(err);
        },
        {
          ...options,
          ...androidExtraOptions,
        } as any
      );
    };

    // Try to get any usable fix quickly first. On physical Android devices this often succeeds
    // from cached/network location even when GPS has not locked yet.
    requestCurrentPosition(
      'getCurrentPosition(fast)',
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
      (err) => {
        // If the quick path times out or no provider is ready, escalate to GPS and wait longer.
        if (err.code === 2 || err.code === 3) {
          requestCurrentPosition('getCurrentPosition(highAccuracy)', {
            enableHighAccuracy: true,
            timeout: 60000,
            maximumAge: 0,
          });
        }
      }
    );

    watchId = Geolocation.watchPosition(
      reportPosition,
      (err) => console.warn('[geolocation] watchPosition', err),
      ({
        enableHighAccuracy: true,
        distanceFilter: 10,
        interval: 5000,
        fastestInterval: 2000,
        timeout: 20000,
        maximumAge: 15000,
        ...androidExtraOptions,
      } as any)
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
