/// <reference types="vite/client" />

declare module '*.wgsl' {
  const source: string;
  export default source;
}
