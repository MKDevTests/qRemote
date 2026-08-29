/**
 * magnet-basket.tsx — the magnet basket: links collected in the background,
 * reviewed and added to qBittorrent in one go.
 *
 * Key exports: MagnetBasketScreen (default)
 * Known issues: None.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import { useMagnetBasket } from '@/context/MagnetBasketContext';
import { FocusAwareStatusBar } from '@/components/FocusAwareStatusBar';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmModal } from '@/components/ConfirmModal';
import { MagnetBasketItem } from '@/utils/magnet-basket';
import { spacing, borderRadius } from '@/constants/spacing';
import { shadows } from '@/constants/shadows';
import { typography } from '@/constants/typography';
import { buttonStyles, buttonText } from '@/constants/buttons';
import { haptics } from '@/utils/haptics';

export default function MagnetBasketScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { items, collectMode, setCollectMode, silentCollect, remove, clear, hydrated } =
    useMagnetBasket();
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);

  const handleAddAll = useCallback(() => {
    haptics.selection();
    router.push('/torrents/add?fromBasket=1');
  }, [router]);

  // A magnet with no `dn` still has to render as something a human can tell
  // apart from the next one, so fall back to the hash before the placeholder.
  const label = (item: MagnetBasketItem) =>
    item.name ?? item.infoHash ?? t('screens.magnetBasket.unnamed');

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <FocusAwareStatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: colors.surfaceOutline }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('screens.magnetBasket.title')}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* The mode switch lives here rather than in Settings: it is what this
            screen is about, and someone who has just collected ten links wants
            to turn it off in the same place they empty the basket. */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="magnet-outline" size={22} color={colors.primary} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  {t('screens.magnetBasket.collectMode')}
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  {silentCollect
                    ? t('screens.magnetBasket.collectModeHintSilent')
                    : t('screens.magnetBasket.collectModeHintForeground')}
                </Text>
              </View>
            </View>
            <Switch
              value={collectMode}
              onValueChange={(value) => {
                haptics.selection();
                setCollectMode(value);
              }}
              trackColor={{ false: colors.surfaceOutline, true: colors.success }}
              ios_backgroundColor={colors.surfaceOutline}
            />
          </View>
        </View>

        {hydrated && items.length === 0 ? (
          <EmptyState
            icon="magnet-outline"
            title={t('screens.magnetBasket.emptyTitle')}
            subtitle={t('screens.magnetBasket.emptyMessage')}
          />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {items.map((item, index) => (
              <View key={item.magnet}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.surfaceOutline }]} />
                )}
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="magnet" size={20} color={colors.primary} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={2}>
                        {label(item)}
                      </Text>
                      {item.name && item.infoHash && (
                        <Text
                          style={[styles.rowHint, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.infoHash}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      haptics.selection();
                      remove(item);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View style={[styles.footer, { borderTopColor: colors.surfaceOutline }]}>
          <TouchableOpacity
            style={[buttonStyles.secondary, styles.footerButton, { borderColor: colors.error }]}
            onPress={() => setClearConfirmVisible(true)}
          >
            <Text style={[buttonText.secondary, { color: colors.error }]}>
              {t('screens.magnetBasket.clearAll')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[buttonStyles.primary, styles.footerButton, { backgroundColor: colors.primary }]}
            onPress={handleAddAll}
          >
            <Text style={buttonText.primary}>
              {t('screens.magnetBasket.addAll', { count: items.length })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ConfirmModal
        visible={clearConfirmVisible}
        title={t('screens.magnetBasket.clearConfirmTitle')}
        message={t('screens.magnetBasket.clearConfirmMessage', { count: items.length })}
        cancelLabel={t('common.cancel')}
        buttons={[
          {
            label: t('screens.magnetBasket.clearAll'),
            destructive: true,
            onPress: () => {
              clear();
              setClearConfirmVisible(false);
            },
          },
        ]}
        onCancel={() => setClearConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 40, alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', ...typography.h3 },
  scroll: { padding: spacing.md, gap: spacing.md },
  card: { borderRadius: borderRadius.large, overflow: 'hidden', ...shadows.small },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...typography.body },
  rowHint: { ...typography.small },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: { flex: 1 },
});
