import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { colors, fonts, radius } from '@/lib/theme';

export function Screen({ children, scroll = true, edges = ['top', 'left', 'right'], refreshControl }: { children: ReactNode; scroll?: boolean; edges?: Edge[]; refreshControl?: React.ReactElement }) {
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={refreshControl as never}>
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.inner, { flex: 1, paddingHorizontal: 16 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, size = 'lg', style }: { children: ReactNode; size?: 'xl' | 'lg' | 'md'; style?: TextStyle }) {
  const fontSize = size === 'xl' ? 34 : size === 'lg' ? 28 : 20;
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={[{ fontFamily: fonts.display, fontSize, lineHeight: fontSize * 1.1, color: colors.text, letterSpacing: -0.4 }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style, numberOfLines }: { children: ReactNode; muted?: boolean; style?: TextStyle; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} maxFontSizeMultiplier={1.8} style={[{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: muted ? colors.muted : colors.text }, style]}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'panel' | 'ghost' | 'danger';
export function Button({ title, onPress, variant = 'secondary', pending, disabled, icon, style, accessibilityLabel }: { title: string; onPress: () => void; variant?: ButtonVariant; pending?: boolean; disabled?: boolean; icon?: ReactNode; style?: ViewStyle; accessibilityLabel?: string }) {
  const bg = { primary: colors.accent, secondary: colors.raised, panel: colors.panel, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: colors.onAccent, secondary: colors.text, panel: colors.onPanel, ghost: colors.text, danger: colors.accentText }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      onPress={onPress}
      disabled={disabled || pending}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0, borderColor: variant === 'danger' ? colors.accent : colors.line },
        style,
      ]}
    >
      {pending ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text style={{ color: fg, fontFamily: fonts.sansBold, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ label, onPress, children, disabled, style }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean; style?: ViewStyle } & Pick<PressableProps, 'hitSlop'>) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: colors.sand, borderColor: colors.sand } : null]}
    >
      <Text style={{ color: active ? colors.onPanel : colors.muted, fontFamily: active ? fonts.sansBold : fonts.sans, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.sansMedium, fontSize: 14 }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8a7f70" style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Body style={{ fontFamily: fonts.sansBold }}>{title}</Body>
      {body ? <Body muted>{body}</Body> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <AlertTriangle color={colors.accentText} size={16} />
      <Body style={{ flex: 1 }}>{message}</Body>
      {onRetry ? <Button variant="ghost" title="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 20 }}>
      <ActivityIndicator color={colors.muted} />
      <Body muted>{label}…</Body>
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'positive' | 'demo' }) {
  const color = { neutral: colors.muted, accent: colors.accentText, positive: colors.positive, demo: colors.sand }[tone];
  return (
    <View style={{ borderWidth: 1, borderColor: color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 11, fontFamily: fonts.sansBold, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  inner: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 16, paddingTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 },
  button: { minHeight: 44, borderRadius: 999, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  input: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, color: colors.text, paddingHorizontal: 12, fontSize: 16, fontFamily: fonts.sans },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, padding: 16, gap: 4 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(214,50,41,0.5)', backgroundColor: 'rgba(214,50,41,0.1)', padding: 12 },
});
