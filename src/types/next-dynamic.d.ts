declare module 'next/dynamic' {
  import type { ComponentType } from 'react';

  interface DynamicOptions<P> {
    loading?: ComponentType<P>;
    ssr?: boolean;
  }

  type DynamicLoader<P> = () => Promise<{ default: ComponentType<P> }>;

  export default function dynamic<P = Record<string, never>>(
    loader: DynamicLoader<P>,
    options?: DynamicOptions<P>,
  ): ComponentType<P>;
}
