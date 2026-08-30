import React, { useState } from 'react';
import { TextInput, TextInputProps, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import { spacing } from '@/constants/spacing';

interface SecureTextInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  /** Colour for the reveal button. Defaults to the theme's secondary text. */
  iconColor?: string;
}

/**
 * A masked field with a button to unmask it.
 *
 * There are six of these in the app — the qBittorrent password, the API key and
 * the reverse-proxy password, each on both the add-server and edit-server
 * screens — and none of them could be checked before saving. A typo in a
 * password you cannot see costs a failed connection and no clue which
 * character was wrong.
 *
 * Renders as a fragment, not a wrapper: every call site already sits inside an
 * `inputRow` laid out as a row, so the field and the button drop straight into
 * it and the caller's `style` keeps working untouched.
 *
 * The reveal state is local and starts hidden on every mount, so leaving the
 * screen and coming back never shows a password the user did not ask to see.
 */
export function SecureTextInput({ style, iconColor, ...props }: SecureTextInputProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      <TextInput {...props} style={style} secureTextEntry={!revealed} />
      <TouchableOpacity
        onPress={() => setRevealed((v) => !v)}
        style={styles.button}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
      >
        <Ionicons
          name={revealed ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={iconColor ?? colors.textSecondary}
        />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingLeft: spacing.sm,
  },
});
