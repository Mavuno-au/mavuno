import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Share, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Animated, FlatList, PanResponder, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, Text } from "@/ui/text";
import { sharePhoto, viewedPhotos } from "@/util/photos";

// Full screen on black: swipe between photos, pinch to zoom, and the photo's
// description under ALT so it helps everyone. Swipe down to close. Share
// gives the photo itself to the share sheet, where Save Image keeps it.
export default function PhotoViewer() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [{ photos, index: first }] = useState(viewedPhotos);
  const [index, setIndex] = useState(first);
  const [showAlt, setShowAlt] = useState(false);
  const [drag] = useState(() => new Animated.Value(0));
  const [sharing, setSharing] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 2,
      onPanResponderMove: (_, gesture) => drag.setValue(Math.max(gesture.dy, 0)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.2) return close();
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );

  const current = photos[index];
  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      <Animated.View {...pan.panHandlers} style={{ flex: 1, transform: [{ translateY: drag }], opacity: drag.interpolate({ inputRange: [0, 300], outputRange: [1, 0.4], extrapolate: "clamp" }) }}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={first}
          getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(photo, at) => `${at}-${photo.url}`}
          onMomentumScrollEnd={(event) => {
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
            setShowAlt(false);
          }}
          renderItem={({ item, index: at }) => (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height, alignItems: "center", justifyContent: "center" }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={item.url}
                style={{ width, height: height - insets.top - insets.bottom - 120 }}
                contentFit="contain"
                accessibilityLabel={item.alt || (photos.length > 1 ? `Photo ${at + 1} of ${photos.length}` : "Photo")}
              />
            </ScrollView>
          )}
        />
      </Animated.View>
      <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.16)" }}>
          <X size={22} color="#ffffff" />
        </Pressable>
        {photos.length > 1 ? (
          <Text variant="subhead" style={{ color: "#ffffff", fontFamily: font.medium }}>
            {index + 1} of {photos.length}
          </Text>
        ) : null}
        {current ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share or save photo"
            accessibilityState={{ busy: sharing }}
            disabled={sharing}
            onPress={() => {
              setSharing(true);
              void sharePhoto(current.url).finally(() => setSharing(false));
            }}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.16)" }}
          >
            {sharing ? <ActivityIndicator color="#ffffff" /> : <Share size={20} color="#ffffff" />}
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      {current?.alt ? (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 16, gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showAlt ? "Hide the description" : "Show the description"}
            onPress={() => setShowAlt((shown) => !shown)}
            style={{ alignSelf: "flex-start", minHeight: 32, paddingHorizontal: 10, borderRadius: 8, justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.16)" }}
          >
            <Text allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 13, color: "#ffffff", letterSpacing: 0.4 }}>
              ALT
            </Text>
          </Pressable>
          {showAlt ? (
            <Text variant="callout" style={{ color: "#ffffff" }}>
              {current.alt}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
