/** Metro resolves bundled audio straight from `require()`; we just need a type. */
declare module '*.wav' {
  const asset: number;
  export default asset;
}