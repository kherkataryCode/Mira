import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import type { NewsItem } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Badge, Body, Button, Card, Chip, Empty, ErrorNote, Loading, Screen, Title } from '@/components/ui';

interface NewsResponse { items: NewsItem[]; status: { sources: number; failingSources: number; lastSuccessAt: string | null; stale: boolean } }
interface Sources { sources: { id: string; name: string; lastError: string | null }[]; suggestions: { name: string; url: string; category: string }[] }

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'importance=breaking', label: 'Breaking' },
  { id: 'importance=important', label: 'Important' },
  { id: 'saved=true', label: 'Saved' },
];

export default function NewsScreen() {
  const [filter, setFilter] = useState('');
  const { data, error, loading, refreshing, reload } = useResource<NewsResponse>(`/news${filter ? `?${filter}` : ''}`);
  const sources = useResource<Sources>('/news/sources');
  const [note, setNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = async () => {
    setActionError(null);
    try {
      const r = await api.post<{ sources: number; added: number }>('/news/refresh');
      setNote(`Checked ${r.sources} source(s): ${r.added} new.`);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };
  const addSuggestion = async (s: { name: string; url: string; category: string }) => {
    try {
      await api.post('/news/sources', s);
      await sources.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <Screen edges={['left', 'right']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body muted>Summaries from sources you choose.</Body>
        <Button title="Check now" onPress={refresh} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => <Chip key={f.label} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />)}
      </ScrollView>
      {note ? <Body muted>{note}</Body> : null}
      {actionError ? <ErrorNote message={actionError} /> : null}
      {data?.status.stale ? <ErrorNote message={`News may be out of date — last update ${data.status.lastSuccessAt ? relativeTime(data.status.lastSuccessAt) : 'never'}.`} /> : null}
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.items.length === 0 ? <Empty title={data.status.sources ? 'No stories yet' : 'Choose your sources'} body="Mira never invents news." /> : null}
      {data?.items.map((n) => (
        <Pressable key={n.id} accessibilityRole="link" accessibilityHint="Opens the original article" onPress={() => void Linking.openURL(n.url)}>
          <Card>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Badge label={n.importance} tone={n.importance === 'breaking' ? 'accent' : n.importance === 'important' ? 'demo' : 'neutral'} />
              {n.isDemo ? <Badge label="Demo sample" tone="demo" /> : null}
            </View>
            <Title size="md">{n.title}</Title>
            {n.summary ? <Body muted numberOfLines={3}>{n.summary}</Body> : null}
            <Body muted style={{ fontSize: 12 }}>{n.sourceName} · {relativeTime(n.publishedAt ?? n.fetchedAt)}</Body>
          </Card>
        </Pressable>
      ))}
      <Card>
        <Title size="md">Sources</Title>
        {sources.data?.sources.map((s) => <Body key={s.id}>{s.name}{s.lastError ? ` — failing: ${s.lastError}` : ''}</Body>)}
        {sources.data?.suggestions.map((s) => <Button key={s.url} title={`Add ${s.name}`} onPress={() => void addSuggestion(s)} />)}
        <Body muted style={{ fontSize: 12 }}>Add custom feeds from the web app.</Body>
      </Card>
    </Screen>
  );
}
