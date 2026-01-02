
// Reference removed to fix "Cannot find type definition" error.
// Manual definitions provided below covering vite/client functionality.

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PUBLIC_SUPABASE_URL?: string;
  readonly VITE_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_KEY: string;
  readonly VITE_PUBLIC_API_KEY?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Fix for "Cannot redeclare block-scoped variable 'process'" error.
// Augmenting NodeJS namespace allows merging with existing process definitions.
declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY?: string;
    [key: string]: string | undefined;
  }
}

declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
  const src: string;
  export default src;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.webp';
declare module '*.ico';
