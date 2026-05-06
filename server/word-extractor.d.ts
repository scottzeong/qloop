declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getFooters(): string;
    getAnnotations(): string;
  }
  class WordExtractor {
    extract(file: string | Buffer): Promise<WordDocument>;
  }
  export = WordExtractor;
}
