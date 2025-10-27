declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm {
    SHA256 = 'SHA-256',
  }

  export function digestStringAsync(
    algorithm: CryptoDigestAlgorithm | string,
    data: string,
    options?: { encoding?: string }
  ): Promise<string>;
}
