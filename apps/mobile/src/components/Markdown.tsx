import { Linking, ScrollView, Text, View, type TextStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import { parseMarkdown, type Inline } from '@friday/shared';
import { colors, fonts } from '@/lib/theme';

/** In-app links in briefings use web paths; the iOS lesson screen lives at /lesson/:id. */
const appPath = (href: string) => href.replace(/^\/learn\/(?=.)/, '/lesson/') as Href;

/** Native renderer for Mira's briefing markdown (no web views, no HTML). */
function inlines(xs: Inline[], base: TextStyle) {
  return xs.map((x, i) => {
    if (x.t === 'bold') return <Text key={i} style={[base, { fontFamily: fonts.sansBold }]}>{x.v}</Text>;
    if (x.t === 'italic') return <Text key={i} style={[base, { fontStyle: 'italic' }]}>{x.v}</Text>;
    if (x.t === 'code') return <Text key={i} style={[base, { fontFamily: 'Menlo', fontSize: 13 }]}>{x.v}</Text>;
    if (x.t === 'link') {
      return (
        <Text key={i} accessibilityRole="link" onPress={() => (x.href.startsWith('/') ? router.push(appPath(x.href)) : void Linking.openURL(x.href))} style={[base, { color: colors.accentText, textDecorationLine: 'underline' }]}>
          {x.v}
        </Text>
      );
    }
    return <Text key={i} style={base}>{x.v}</Text>;
  });
}

const body: TextStyle = { color: colors.text, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 };

export function Markdown({ text }: { text: string }) {
  return (
    <View style={{ gap: 10 }}>
      {parseMarkdown(text).map((b, i) => {
        if (b.t === 'heading') {
          return (
            <Text key={i} accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.display, fontSize: b.level === 1 ? 22 : 19, lineHeight: 25, marginTop: i ? 8 : 0 }}>
              {inlines(b.inlines, { color: colors.text, fontFamily: fonts.display })}
            </Text>
          );
        }
        if (b.t === 'paragraph') return <Text key={i} style={body}>{inlines(b.inlines, body)}</Text>;
        if (b.t === 'rule') return <View key={i} style={{ height: 1, backgroundColor: colors.line }} />;
        if (b.t === 'code') {
          return (
            <ScrollView key={i} horizontal style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 10 }}>
              <Text selectable style={{ color: colors.text, fontFamily: 'Menlo', fontSize: 11.5, lineHeight: 15 }}>{b.text}</Text>
            </ScrollView>
          );
        }
        return (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
                <Text style={[body, { color: colors.muted, minWidth: 16 }]}>{b.ordered ? `${b.start + j}.` : '•'}</Text>
                <Text style={[body, { flex: 1 }]}>{inlines(it, body)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
