import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
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
  /** When set, a back chevron appears left of the title and calls this on press. */
  onBack?: () => void;
  /** Accent palette; defaults to the open-mode orange. */
  accent?: Accent;
  /** Draw the faint concentric-ring backdrop behind the content. */
  rings?: boolean;
  /** Render children in a ScrollView (default) or a plain flex View. */
  scroll?: boolean;
  /** Pull-to-refresh (scroll mode only). */
  refreshing?: boolean;
  onRefresh?: () => void;
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
  onBack,
  accent,
  rings = false,
  scroll = true,
  refreshing,
  onRefresh,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const [centre, setCentre] = useState({ x: 0, y: 0 });
  const tint = accent?.base ?? '#FF5500';

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
          <View style={styles.headerLeft}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={styles.backBtn}
              >
                <Text style={[styles.backChevron, { color: tint }]}>‹</Text>
              </Pressable>
            ) : null}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {headerRight}
        </View>

        {scroll ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onLayout={onBodyLayout}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={tint}
                  colors={[tint]}
                />
              ) : undefined
            }
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  backBtn: { paddingRight: 2, marginTop: -4 },
  backChevron: { fontFamily: FONT, fontSize: 34, lineHeight: 36 },
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
