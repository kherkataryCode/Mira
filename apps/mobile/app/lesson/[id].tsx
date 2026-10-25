import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import type { Lesson } from '@friday/shared';
import { api, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { colors, fonts } from '@/lib/theme';
import { Art } from '@/components/Art';
import { Body, Button, Card, ErrorNote, Eyebrow, Loading, Screen, Title } from '@/components/ui';

interface QuizResult { correct: number; total: number; score: number; results: { correct: boolean; answer: number; why: string }[]; nextReviewAt: string; note: string }

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<{ lesson: Lesson }>(`/learn/lessons/${id}`);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const lesson = data?.lesson;

  useEffect(() => {
    if (!lesson) return;
    setAnswers((a) => (a.length ? a : lesson.quiz?.map(() => null) ?? []));
    setSaved(Boolean(lesson.progress?.saved));
    if (!lesson.progress) void api.post(`/learn/lessons/${lesson.id}/start`).catch(() => undefined);
  }, [lesson]);

  if (loading && !data) return <Screen edges={['left', 'right']}><Loading /></Screen>;
  if (!lesson) return <Screen edges={['left', 'right']}>{error ? <ErrorNote message={error} onRetry={reload} /> : null}</Screen>;

  const submit = async () => {
    setPending(true);
    setActionError(null);
    try {
      setResult(await api.post<QuizResult>(`/learn/lessons/${lesson.id}/quiz`, { answers }));
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const toggleSave = async () => {
    try {
      const r = await api.post<{ saved: boolean }>(`/learn/lessons/${lesson.id}/save`, { saved: !saved });
      setSaved(r.saved);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <Screen edges={['left', 'right']}>
      <View style={{ borderRadius: 28, overflow: 'hidden' }}><Art seed={lesson.artSeed} height={170} /></View>
      <Eyebrow>{lesson.topic} · {lesson.level} · {lesson.minutes} min</Eyebrow>
      <Title size="xl">{lesson.title}</Title>
      <Body muted>{lesson.summary}</Body>
      <Button title={saved ? 'Saved' : 'Save lesson'} onPress={toggleSave} style={{ alignSelf: 'flex-start' }} />
      <Title size="md">The idea</Title>
      <Body>{lesson.explanation}</Body>
      {lesson.steps?.length ? (
        <>
          <Title size="md">How it works</Title>
          {lesson.steps.map((st, i) => <Body key={i}>{i + 1}. {st}</Body>)}
        </>
      ) : null}
      {lesson.diagram ? (
        <>
          <Title size="md">Architecture view</Title>
          <ScrollView horizontal style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }} contentContainerStyle={{ padding: 12 }}>
            <Text selectable style={{ color: colors.text, fontFamily: 'Menlo', fontSize: 11.5, lineHeight: 15 }}>{lesson.diagram}</Text>
          </ScrollView>
        </>
      ) : null}
      <View style={{ backgroundColor: colors.panel, borderRadius: 22, padding: 16, gap: 6 }}>
        <Eyebrow style={{ color: 'rgba(20,17,15,0.7)' }}>Real-world example</Eyebrow>
        <Body style={{ color: colors.onPanel }}>{lesson.example}</Body>
      </View>
      <View style={{ borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: 12, gap: 4 }}>
        <Eyebrow>Key takeaway</Eyebrow>
        <Title size="md">{lesson.takeaway}</Title>
      </View>
      {lesson.insight ? (
        <Card>
          <Eyebrow>Defensive tip</Eyebrow>
          <Title size="md">{lesson.insight.title}</Title>
          <Body>{lesson.insight.body}</Body>
          {lesson.insight.bullets.map((b, i) => <Body key={i}>• {b}</Body>)}
        </Card>
      ) : null}
      {lesson.question ? (
        <>
          <Title size="md">Logical question</Title>
          <Body>{lesson.question}</Body>
        </>
      ) : null}
      {lesson.learnMore ? (
        <Text accessibilityRole="link" onPress={() => void Linking.openURL(lesson.learnMore!.url)} style={{ color: colors.accentText, textDecorationLine: 'underline', paddingVertical: 8 }}>
          Learn more: {lesson.learnMore.label}
        </Text>
      ) : null}
      {lesson.quiz?.length ? (
        <Card>
          <Title size="md">Quick check</Title>
          {lesson.quiz.map((q, qi) => (
            <View key={qi} style={{ gap: 6 }}>
              <Body style={{ fontFamily: fonts.sansBold }}>{qi + 1}. {q.q}</Body>
              {q.options.map((opt, oi) => {
                const r = result?.results[qi];
                const chosen = answers[qi] === oi;
                const right = r && r.answer === oi;
                return (
                  <Pressable
                    key={oi}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen, disabled: Boolean(result) }}
                    disabled={Boolean(result)}
                    onPress={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                    style={{ minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderColor: right ? colors.positive : r && chosen ? colors.accent : chosen ? colors.sand : colors.line, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Body style={{ flex: 1 }}>{opt}</Body>
                    {right ? <CheckCircle2 size={16} color={colors.positive} /> : r && chosen ? <XCircle size={16} color={colors.accentText} /> : null}
                  </Pressable>
                );
              })}
              {result?.results[qi] ? <Body muted>{result.results[qi]!.why}</Body> : null}
            </View>
          ))}
          {actionError ? <ErrorNote message={actionError} /> : null}
          {result ? (
            <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
              <Body style={{ fontFamily: fonts.sansBold }}>You got {result.correct} of {result.total} ({result.score}%).</Body>
              <Body muted>{result.note}</Body>
              <Button title="Try again" onPress={() => { setResult(null); setAnswers(lesson.quiz!.map(() => null)); }} />
            </View>
          ) : (
            <Button variant="primary" title="Check answers" onPress={submit} pending={pending} disabled={answers.some((a) => a === null)} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
