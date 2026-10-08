import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import { ExternalLink, Play } from 'lucide-react-native';

export function ServerVideo({
  url,
  name,
  onOpen,
}: {
  url: string;
  name: string;
  onOpen: (url: string) => void;
}) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${name}`}
        onPress={() => onOpen(url)}
        style={styles.fallback}
      >
        <ExternalLink size={20} color="#ffffff" />
        <Text style={styles.filename}>{name}</Text>
      </Pressable>
    );
  return (
    <View style={styles.frame}>
      <Video
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={!started}
        controls={started}
        playInBackground={false}
        playWhenInactive={false}
        onError={() => setFailed(true)}
      />
      {!started && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${name}`}
          onPress={() => setStarted(true)}
          style={styles.play}
        >
          <Play size={36} color="#ffffff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 240,
    maxWidth: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#181818',
    borderRadius: 4,
    overflow: 'hidden',
    margin: 4,
  },
  play: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#181818',
  },
  filename: { color: '#ffffff', flexShrink: 1 },
});
