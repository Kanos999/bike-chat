import React from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Accent, COLORS, FONT } from './bikerTheme';
import { crewJoinUrl } from '../modules/deepLink';

/**
 * Bottom-sheet-style modal that shares a crew invite. Shows a QR of the crew's
 * `bikechat://join?code=…` deep link (dark modules on white so any camera scans
 * it), the plain code as a fallback, and a native Share button.
 */
export default function CrewShareSheet({
  visible,
  name,
  code,
  accent,
  onClose,
}: {
  visible: boolean;
  name: string;
  code: string;
  accent: Accent;
  onClose: () => void;
}) {
  const url = crewJoinUrl(code);

  const onShare = () => {
    void Share.share({
      message: `Join my Bike Chat crew "${name}" — scan the QR or enter code ${code}.\n${url}`,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner press is swallowed so tapping the card doesn't dismiss. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub}>Scan to join · or share the code</Text>

          <View style={styles.qrBox}>
            <QRCode value={url} size={196} backgroundColor="#fff" color="#000" />
          </View>

          <Text style={[styles.code, { color: accent.base }]}>{code}</Text>

          <Pressable style={[styles.shareBtn, { borderColor: accent.base }]} onPress={onShare}>
            <Text style={[styles.shareText, { color: accent.base }]}>Share invite</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  title: { fontFamily: FONT, fontSize: 22, letterSpacing: 0.6, color: '#fff', textTransform: 'uppercase' },
  sub: {
    fontFamily: FONT,
    fontSize: 11,
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.52)',
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 20,
  },
  qrBox: { backgroundColor: '#fff', padding: 14, borderRadius: 12 },
  code: { fontFamily: FONT, fontSize: 26, letterSpacing: 6, marginTop: 18, marginLeft: 6 },
  shareBtn: {
    marginTop: 20,
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareText: { fontFamily: FONT, fontSize: 15, letterSpacing: 2, textTransform: 'uppercase' },
  closeBtn: { marginTop: 14, paddingVertical: 6 },
  closeText: {
    fontFamily: FONT,
    fontSize: 13,
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.52)',
    textTransform: 'uppercase',
  },
});
