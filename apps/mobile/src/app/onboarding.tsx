import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { completeOnboarding } from '@/lib/onboarding';

const GLOW = require('../../assets/brand/glow.png');
const CTA = require('../../assets/brand/cta.png');

type Slide = {
  key: string;
  kind: 'hero' | 'score' | 'art';
  image: ReturnType<typeof require>;
  eyebrow?: string;
  title: string;
  body: string;
};

function useSlides(t: (key: string) => string): Slide[] {
  return [
    {
      key: 'hero',
      kind: 'hero',
      image: require('../../assets/brand/voxscore-hero.png'),
      title: t('Onboarding.slide1Title'),
      body: t('Onboarding.slide1Body'),
    },
    {
      key: 'add',
      kind: 'art',
      image: require('../../assets/brand/slide-add.png'),
      eyebrow: t('Onboarding.slide2Eyebrow'),
      title: t('Onboarding.slide2Title'),
      body: t('Onboarding.slide2Body'),
    },
    {
      key: 'score',
      kind: 'score',
      image: require('../../assets/brand/slide-score.png'),
      eyebrow: t('Onboarding.slide3Eyebrow'),
      title: t('Onboarding.slide3Title'),
      body: t('Onboarding.slide3Body'),
    },
    {
      key: 'battle',
      kind: 'art',
      image: require('../../assets/brand/slide-battle.png'),
      eyebrow: t('Onboarding.slide4Eyebrow'),
      title: t('Onboarding.slide4Title'),
      body: t('Onboarding.slide4Body'),
    },
  ];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const SLIDES = useSlides(t);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await completeOnboarding();
    router.replace('/');
  };

  const next = () => {
    if (isLast) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Image source={GLOW} style={styles.glow} contentFit="contain" pointerEvents="none" />

      <View style={styles.topBar}>
        <Pressable onPress={() => void finish()} hitSlop={12}>
          <Text style={styles.skip}>{isLast ? '' : t('Onboarding.skip')}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.art}>
              {item.kind === 'hero' ? (
                <Image source={item.image as number} style={styles.hero} contentFit="contain" />
              ) : (
                <View style={styles.artWrap}>
                  <Image
                    source={item.image as number}
                    style={styles.artImage}
                    contentFit="contain"
                  />
                  {item.kind === 'score' && (
                    <View style={styles.scoreOverlay} pointerEvents="none">
                      <Text style={styles.scoreNum}>86</Text>
                      <Text style={styles.scoreLabel}>{t('Onboarding.scoreLabel')}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={styles.copy}>
              {!!item.eyebrow && <Text style={styles.eyebrow}>{item.eyebrow}</Text>}
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              {item.kind === 'score' && (
                <View style={styles.chip}>
                  <View style={styles.chipDot} />
                  <Text style={styles.chipText}>{t('Common.provisionalBadge')}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [7, 22, 7],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return <Animated.View key={s.key} style={[styles.dot, { width: dotWidth, opacity }]} />;
          })}
        </View>

        <Pressable onPress={next} style={({ pressed }) => [pressed && styles.ctaPressed]}>
          <ImageBackground
            source={CTA}
            style={styles.cta}
            imageStyle={styles.ctaImage}
            resizeMode="cover"
          >
            <Text style={styles.ctaText}>
              {isLast ? t('Onboarding.getStarted') : t('Onboarding.continue')}
            </Text>
          </ImageBackground>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070d18' },
  glow: {
    position: 'absolute',
    top: -160,
    alignSelf: 'center',
    width: 560,
    height: 560,
    opacity: 0.9,
  },
  topBar: { height: 36, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'flex-end' },
  skip: { color: '#7c8ba1', fontSize: 15, fontWeight: '600' },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  art: { height: 300, alignItems: 'center', justifyContent: 'center' },
  hero: { width: 300, height: 150 },
  artWrap: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  artImage: { width: 240, height: 240 },
  scoreOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 64, fontWeight: '800', color: '#F8FAFC', letterSpacing: -1 },
  scoreLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', letterSpacing: 3, color: '#22D3EE' },

  copy: { alignItems: 'center', marginTop: 28, maxWidth: 360 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#22D3EE',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: '#F4F8FC',
    textAlign: 'center',
  },
  body: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 23,
    color: '#9fb1c6',
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.30)',
  },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22D3EE' },
  chipText: { color: '#7fe3f3', fontSize: 12, fontWeight: '600' },

  footer: { paddingHorizontal: 28, paddingBottom: 8, gap: 22 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 10,
  },
  dot: { height: 7, borderRadius: 4, backgroundColor: '#22D3EE' },
  cta: { height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaImage: { borderRadius: 16 },
  ctaPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  ctaText: { color: '#04121f', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});
