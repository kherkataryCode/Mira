import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Lesson } from '@friday/shared';
import { useResource } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { Art } from '@/components/Art';
import { Badge, Body, Chip, Empty, ErrorNote, Eyebrow, Loading, Screen, Title } from '@/components/ui';

interface LearnIndex { featured: Lesson | null; continueLearning: Lesson[]; lessons: Lesson[]; topics: string[] }

function LessonCard({ l, onPress }: { l: Lesson; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${l.title}, ${l.minutes} minutes`} onPress={onPress} style={{ flex: 1, minWidth: 240, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <Art seed={l.artSeed} height={90} />
      <View style={{ padding: 12, gap: 4 }}>
        <Eyebrow>{l.topic} · {l.minutes} min</Eyebrow>
        <Title size="md">{l.title}</Title>
        <Body muted numberOfLines={2}>{l.summary}</Body>
        {l.progress?.status === 'completed' ? <Badge label={`Done${l.progress.lastScore !== null ? ` · ${l.progress.lastScore}%` : ''}`} tone="positive" /> : null}
        {l.progress?.status === 'started' ? <Badge label="In progress" tone="demo" /> : null}
      </View>
    </Pressable>
  );
}

export default function LearnScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'foryou' | 'saved' | 'history'>('foryou');
  const { data, error, loading, refreshing, reload } = useResource<LearnIndex>(`/learn/lessons${tab === 'saved' ? '?filter=saved' : tab === 'history' ? '?filter=history' : ''}`);
  const open = (id: string) => router.push(`/lesson/${id}`);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <Title>Learn</Title>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="For you" active={tab === 'foryou'} onPress={() => setTab('foryou')} />
        <Chip label="Saved" active={tab === 'saved'} onPress={() => setTab('saved')} />
        <Chip label="History" active={tab === 'history'} onPress={() => setTab('history')} />
      </ScrollView>
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && tab === 'foryou' && data.featured ? (
        <Pressable accessibilityRole="button" onPress={() => open(data.featured!.id)} style={{ borderRadius: 28, overflow: 'hidden' }}>
          <Art seed={data.featured.artSeed} height={width > 700 ? 240 : 200} />
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16, gap: 6 }}>
            <Eyebrow style={{ color: 'rgba(222,205,182,0.85)' }}>{data.featured.topic} · {data.featured.minutes} min read</Eyebrow>
            <Title size="xl" style={{ color: colors.cream }}>{data.featured.title}</Title>
          </View>
        </Pressable>
      ) : null}
      {data && tab === 'foryou' && data.continueLearning.length ? (
        <>
          <Title size="md">Continue learning</Title>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {data.continueLearning.map((l) => <View key={l.id} style={{ width: 260 }}><LessonCard l={l} onPress={() => open(l.id)} /></View>)}
          </ScrollView>
        </>
      ) : null}
      {data ? (
        data.lessons.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{data.lessons.map((l) => <LessonCard key={l.id} l={l} onPress={() => open(l.id)} />)}</View>
        ) : (
          <Empty title={tab === 'saved' ? 'Nothing saved yet' : 'Nothing here yet'} />
        )
      ) : null}
    </Screen>
  );
}
