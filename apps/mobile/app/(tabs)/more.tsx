import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlarmClock, LogOut, Newspaper, Settings, StickyNote } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { Body, Card, Screen, Title } from '@/components/ui';

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const items = [
    { label: 'Reminders', icon: AlarmClock, href: '/reminders' as const },
    { label: 'News', icon: Newspaper, href: '/news' as const },
    { label: 'Notes', icon: StickyNote, href: '/notes' as const },
    { label: 'Settings', icon: Settings, href: '/settings' as const },
  ];
  return (
    <Screen>
      <Title>More</Title>
      <Body muted>Signed in as {user?.displayName} ({user?.email})</Body>
      <Card style={{ padding: 6, gap: 0 }}>
        {items.map(({ label, icon: Icon, href }) => (
          <Pressable key={label} accessibilityRole="button" onPress={() => router.push(href)} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }}>
            <Icon size={20} color={colors.muted} />
            <Body>{label}</Body>
          </Pressable>
        ))}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }}>
          <LogOut size={20} color={colors.accentText} />
          <Body style={{ color: colors.accentText }}>Sign out</Body>
        </Pressable>
      </Card>
    </Screen>
  );
}
