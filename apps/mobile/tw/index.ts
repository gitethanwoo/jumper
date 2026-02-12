import { useNativeVariable as useFunctionalVariable } from "react-native-css";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native-css/components";

export { Pressable, ScrollView, Text, TextInput, View };

export const useCSSVariable =
  process.env.EXPO_OS !== "web"
    ? useFunctionalVariable
    : (variable: string) => `var(${variable})`;
