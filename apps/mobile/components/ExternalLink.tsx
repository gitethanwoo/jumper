import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Linking, Platform, Pressable, type PressableProps } from 'react-native';

export function ExternalLink(props: PressableProps & { href: string }) {
  const { href, onPress, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        onPress?.(e);
        if (Platform.OS !== 'web') {
          WebBrowser.openBrowserAsync(href);
          return;
        }
        Linking.openURL(href);
      }}
    />
  );
}
