import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavTabLabel } from './BottomNav';
import ConcentricRings from './ConcentricRings';
import { Accent, COLORS, FONT } from './bikerTheme';
import type { AppNavigation } from '../app/App';

interface Props {
  title: string;
  navigation: AppNavigation;
  activeTab: NavTabLabel;
  /** Right-aligned header content (e.g. a <Chip />). */
  headerRight?: React.ReactNode;
  /** Accent palette; defaults to the open-mode orange. */
  accent?: Accent;
  /** Draw the faint concentric-ring backdrop behind the content. */
  rings?: boolean;
  /** Render children in a ScrollView (default) or a plain flex View. */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * Standard dark screen chrome shared by the secondary screens (Settings, Groups,
 * RideSummary): black background, status bar, optional ring backdrop, a header
 * with a Bebas title, the scrollable body, and the shared bottom nav. MainScreen
 * keeps its own bespoke layout but uses the same BottomNav.
 */
export default function ScreenScaffold({
  title,
  headerRight,
  rings = false,
  scroll = true,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const [centre, setCentre] = useState({ x: 0, y: 0 });

  const onBodyLayout = (e: LayoutChangeEvent) => {
    if (!rings) return;
    const { x, y, width, height } = e.nativeEvent.layout;
    setCentre({ x: x + width / 2, y: y + height / 2 });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      {rings ? <ConcentricRings centreX={centre.x} centreY={centre.y} /> : null}

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 14 : 46 }]}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {headerRight}
        </View>

        {scroll ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onLayout={onBodyLayout}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.body, styles.bodyContent]} onLayout={onBodyLayout}>
            {children}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FONT,
    fontSize: 30,
    color: '#fff',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
});
