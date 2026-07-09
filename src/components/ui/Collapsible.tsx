import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  expanded: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Collapsible({ expanded, children, style }: Props) {
  if (!expanded) return null;
  return <View style={style}>{children}</View>;
}
