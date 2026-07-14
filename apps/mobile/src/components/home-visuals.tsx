import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { alpha, COLORS, FONTS } from '@/constants/brand';
import type { SongEntry } from '@/lib/home-feed';

/** Rank medal tints for the top three; everyone else gets a neutral chip. */
const MEDAL: Record<number, string> = { 1: '#FCD34D', 2: '#CBD5E1', 3: '#F0A868' };

function fmtScore(score: number | null): string {
  return score == null ? '—' : score.toFixed(1);
}

/** Score + provisional/measured status, right-aligned. Shared by card + hero. */
function ScoreBlock({ entry, large }: { entry: SongEntry; large?: boolean }) {
  const { t } = useTranslation();
  const measured = entry.topScore != null && !entry.topIsProvisional;
  return (
    <View style={styles.scoreBlock}>
      <Text style={[styles.scoreNum, large && styles.scoreNumLarge]}>
        {fmtScore(entry.topScore)}
      </Text>
      <View style={styles.statusRow}>
        <View
          style={[styles.statusDot, { backgroundColor: measured ? COLORS.green : COLORS.amber }]}
        />
        <Text style={[styles.statusText, { color: measured ? COLORS.green : COLORS.amber }]}>
          {measured ? t('Home.measured') : t('Home.provisional')}
        </Text>
      </View>
    </View>
  );
}

/** "N covers competing" pill — amber when the song is below the 3-cover goal. */
function CoverChip({ entry }: { entry: SongEntry }) {
  const { t } = useTranslation();
  const tint = entry.needsMoreCovers ? COLORS.amber : COLORS.cyanSoft;
  return (
    <View style={[styles.metaChip, { borderColor: alpha(tint, 0.35) }]}>
      <Ionicons name="people" size={12} color={tint} />
      <Text style={[styles.metaChipText, { color: tint }]}>
        {entry.needsMoreCovers
          ? t('Home.needMoreCovers', { count: entry.coverCount })
          : t('Home.coversCompeting', { count: entry.coverCount })}
      </Text>
    </View>
  );
}

export type SongCardProps = {
  entry: SongEntry;
  rank: number;
  categoryLabel: string;
  onPress: (songId: string) => void;
};

/** Premium song row: cover art, title/artist, category + cover count, score. */
export const SongCard = memo(function SongCard({
  entry,
  rank,
  categoryLabel,
  onPress,
}: SongCardProps) {
  const medal = MEDAL[rank];
  return (
    <Pressable
      onPress={() => onPress(entry.songId)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${entry.title} — ${entry.artist}`}
    >
      <View style={styles.thumbWrap}>
        {entry.thumbnailUrl ? (
          <Image
            source={{ uri: entry.thumbnailUrl }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="musical-notes" size={22} color={COLORS.faint} />
          </View>
        )}
        <View style={[styles.rankChip, medal ? { backgroundColor: medal } : styles.rankChipPlain]}>
          <Text style={[styles.rankChipText, medal ? { color: COLORS.onCyan } : undefined]}>
            {rank}
          </Text>
        </View>
      </View>

      <View style={styles.cardMain}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        {!!entry.artist && (
          <Text style={styles.cardArtist} numberOfLines={1}>
            {entry.artist}
          </Text>
        )}
        <View style={styles.metaRow}>
          {!!categoryLabel && (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipMuted}>{categoryLabel}</Text>
            </View>
          )}
          <CoverChip entry={entry} />
        </View>
      </View>

      <ScoreBlock entry={entry} />
    </Pressable>
  );
});

export type FeaturedHeroProps = {
  entry: SongEntry;
  categoryLabel: string;
  onPress: (songId: string) => void;
};

/** The #1 song, rendered large with its cover as an ambient backdrop. */
export const FeaturedHero = memo(function FeaturedHero({
  entry,
  categoryLabel,
  onPress,
}: FeaturedHeroProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onPress(entry.songId)}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('Home.featuredEyebrow') + ': ' + entry.title}
    >
      {entry.thumbnailUrl ? (
        <Image
          source={{ uri: entry.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={250}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.thumbFallback]} />
      )}
      {/* Layered scrims stand in for a gradient (no gradient dep) so the
          copy stays legible over any cover art. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(COLORS.pageBg, 0.35) }]} />
      <View style={styles.heroScrim} />

      <View style={styles.heroTop}>
        <View style={styles.heroEyebrow}>
          <Ionicons name="sparkles" size={12} color={COLORS.onCyan} />
          <Text style={styles.heroEyebrowText}>{t('Home.featuredEyebrow')}</Text>
        </View>
        {!!categoryLabel && (
          <View style={styles.heroCategory}>
            <Text style={styles.heroCategoryText}>{categoryLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.heroBottom}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        {!!entry.artist && (
          <Text style={styles.heroArtist} numberOfLines={1}>
            {entry.artist}
          </Text>
        )}
        <View style={styles.heroMetaRow}>
          <ScoreBlock entry={entry} large />
          <View style={styles.heroCoverChip}>
            <Ionicons name="people" size={13} color={COLORS.ink} />
            <Text style={styles.heroCoverText}>
              {t('Home.coversCompeting', { count: entry.coverCount })}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export type CategoryChipsProps = {
  categories: string[];
  active: string | null;
  labelFor: (c: string) => string;
  onSelect: (c: string | null) => void;
};

/** Horizontal category filter. `null` = all songs. */
export function CategoryChips({ categories, active, labelFor, onSelect }: CategoryChipsProps) {
  const { t } = useTranslation();
  const chip = (key: string | null, label: string) => {
    const on = active === key;
    return (
      <Pressable
        key={key ?? '__all'}
        onPress={() => onSelect(key)}
        style={({ pressed }) => [
          styles.catChip,
          on && styles.catChipOn,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.catRow}
    >
      {chip(null, t('Home.allCategories'))}
      {categories.map((c) => chip(c, labelFor(c)))}
    </ScrollView>
  );
}

/** Shimmerless skeleton placeholder shown while the feed loads. */
export function SkeletonCard() {
  return (
    <View style={[styles.card, styles.skeleton]}>
      <View style={[styles.thumb, styles.skelBlock]} />
      <View style={styles.cardMain}>
        <View style={[styles.skelLine, { width: '70%' }]} />
        <View style={[styles.skelLine, { width: '45%', marginTop: 8 }]} />
        <View style={[styles.skelLine, { width: '55%', marginTop: 12, height: 18 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },

  // --- Song card ---
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.raised,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  thumbWrap: { width: 68, height: 68 },
  thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: COLORS.raisedFaint },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.borderDeep,
  },
  rankChip: {
    position: 'absolute',
    top: -6,
    left: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  rankChipPlain: { backgroundColor: COLORS.borderDeep },
  rankChipText: { fontFamily: FONTS.monoMedium, fontSize: 11, color: COLORS.ink },
  cardMain: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: FONTS.sansBold, fontSize: 15, color: COLORS.ink },
  cardArtist: { fontFamily: FONTS.sans, fontSize: 12, color: COLORS.muted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaChipText: { fontFamily: FONTS.sansSemibold, fontSize: 10.5 },
  metaChipMuted: { fontFamily: FONTS.sansSemibold, fontSize: 10.5, color: COLORS.faint },

  // --- Score block ---
  scoreBlock: { alignItems: 'flex-end', gap: 3, minWidth: 52 },
  scoreNum: { fontFamily: FONTS.monoMedium, fontSize: 20, color: COLORS.cyan },
  scoreNumLarge: { fontSize: 34, color: COLORS.inkBright },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: FONTS.sansSemibold, fontSize: 9, letterSpacing: 0.3 },

  // --- Featured hero ---
  hero: {
    borderRadius: 22,
    overflow: 'hidden',
    aspectRatio: 1.7,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.borderDeep,
  },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: alpha(COLORS.pageBg, 0.72),
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cyan,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroEyebrowText: {
    fontFamily: FONTS.sansBold,
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.onCyan,
    textTransform: 'uppercase',
  },
  heroCategory: {
    backgroundColor: alpha(COLORS.pageBg, 0.55),
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: alpha(COLORS.inkBright, 0.15),
  },
  heroCategoryText: { fontFamily: FONTS.sansSemibold, fontSize: 11, color: COLORS.ink },
  heroBottom: { padding: 16, gap: 4 },
  heroTitle: { fontFamily: FONTS.sansBold, fontSize: 24, color: COLORS.inkBright, lineHeight: 28 },
  heroArtist: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.muted },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  heroCoverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: alpha(COLORS.inkBright, 0.12),
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroCoverText: { fontFamily: FONTS.sansSemibold, fontSize: 12, color: COLORS.ink },

  // --- Category chips ---
  catRow: { flexDirection: 'row', gap: 8 },
  catChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  catChipOn: { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan },
  catChipText: { fontFamily: FONTS.sansSemibold, fontSize: 12.5, color: COLORS.muted },
  catChipTextOn: { color: COLORS.onCyan },

  // --- Skeleton ---
  skeleton: { opacity: 0.6 },
  skelBlock: { backgroundColor: COLORS.border },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: COLORS.border },
});
