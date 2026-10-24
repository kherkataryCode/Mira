import { Linking, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, BookOpen, CheckSquare, Mic, Newspaper, RefreshCw } from 'lucide-react-native';
import type { Home } from '@friday/shared';
import { api } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';
import { Art } from '@/components/Art';
import { Body, Button, Card, Empty, ErrorNote, Eyebrow, Loading, Screen, Title } from '@/components/ui';
import { TaskRow } from '@/components/TaskRow';
import { QuickAdd } from '@/components/QuickAdd';
import { useState } from 'react';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const twoCol = width >= 700;
  const { data, error, loading, refreshing, reload } = useResource<Home>('/home');
  const [briefPending, setBriefPending] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const generate = async () => {
    setBriefPending(true);
    setBriefError(null);
    try {
      await api.post('/briefs/generate');
      await reload();
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : 'Could not generate the brief.');
    } finally {
      setBriefPending(false);
    }
  };

  if (loading && !data) return <Screen><Loading label="Preparing your day" /></Screen>;
  if (!data) return <Screen>{error ? <ErrorNote message={error} onRetry={reload} /> : null}</Screen>;
  const tz = data.timezone;

  const column = (children: React.ReactNode) => <View style={{ flex: 1, gap: 16, minWidth: 0 }}>{children}</View>;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Title size="xl">{data.greeting}</Title>
          <Body muted>{data.counts.tasksToday} tasks · {data.counts.reminders} reminders today</Body>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Talk to Friday" onPress={() => router.push('/chat')} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Mic color={colors.onAccent} size={22} />
        </Pressable>
      </View>

      <View style={{ borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
        <Art seed={2} height={twoCol ? 200 : 170} />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16, gap: 8 }}>
          <Eyebrow style={{ color: 'rgba(222,205,182,0.85)' }}>Daily brief{data.brief ? (data.brief.generatedBy === 'ai' ? ' · AI-written' : ' · from your data') : ''}</Eyebrow>
          <Text style={{ fontFamily: fonts.display, color: colors.cream, fontSize: 22, lineHeight: 26 }}>{data.brief ? data.brief.content.headline : 'Your brief is not ready yet'}</Text>
          <Button variant="panel" title={data.brief ? 'Refresh' : 'Generate brief'} onPress={generate} pending={briefPending} icon={<RefreshCw size={14} color={colors.onPanel} />} style={{ alignSelf: 'flex-start' }} />
        </View>
      </View>
      {briefError ? <ErrorNote message={briefError} /> : null}

      <View style={{ flexDirection: twoCol ? 'row' : 'column', gap: 16 }}>
        {column(
          <>
            <Card>
              <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16 }}>Today&apos;s tasks</Text>
              {data.tasks.length ? data.tasks.map((t) => <TaskRow key={t.id} task={t} timezone={tz} onChange={reload} />) : <Empty title="Nothing due today" />}
            </Card>
            <Card>
              <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16 }}>Quick add</Text>
              <QuickAdd onSaved={reload} />
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Tasks', icon: CheckSquare, href: '/tasks' as const },
                  { label: 'Reminders', icon: Bell, href: '/reminders' as const },
                  { label: 'News', icon: Newspaper, href: '/news' as const },
                  { label: 'Learn', icon: BookOpen, href: '/learn' as const },
                ].map(({ label, icon: Icon, href }) => (
                  <Pressable key={label} accessibilityRole="button" onPress={() => router.push(href)} style={{ flexGrow: 1, flexBasis: '45%', minHeight: 52, borderRadius: 16, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                    <Icon size={16} color={colors.onPanel} />
                    <Text style={{ color: colors.onPanel, fontFamily: fonts.sansBold }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          </>,
        )}
        {column(
          <>
            <Card>
              <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16 }}>Next reminders</Text>
              {data.reminders.length ? (
                data.reminders.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Bell size={16} color={colors.positive} />
                    <View style={{ flex: 1 }}>
                      <Body>{r.title}</Body>
                      <Body muted style={{ fontSize: 12 }}>{fmtDateTime(r.nextOccurrenceAt, tz)}</Body>
                    </View>
                  </View>
                ))
              ) : (
                <Empty title="No upcoming reminders" />
              )}
            </Card>
            {data.lesson ? (
              <Pressable accessibilityRole="button" onPress={() => router.push(`/lesson/${data.lesson!.id}`)} style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
                <Art seed={data.lesson.artSeed} height={110} />
                <View style={{ padding: 14, gap: 4 }}>
                  <Eyebrow>{data.lesson.topic} · {data.lesson.minutes} min</Eyebrow>
                  <Title size="md">{data.lesson.title}</Title>
                  <Body muted numberOfLines={2}>{data.lesson.summary}</Body>
                </View>
              </Pressable>
            ) : null}
            <Card>
              <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 16 }}>Top news</Text>
              {data.news.length ? (
                data.news.map((n) => (
                  <Pressable key={n.id} accessibilityRole="link" onPress={() => void Linking.openURL(n.url)} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Body>{n.title}</Body>
                    <Body muted style={{ fontSize: 12 }}>{n.isDemo ? 'Demo sample · ' : ''}{n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}</Body>
                  </Pressable>
                ))
              ) : (
                <Empty title="No news yet" body="Choose sources under More → News." />
              )}
            </Card>
          </>,
        )}
      </View>
    </Screen>
  );
}
