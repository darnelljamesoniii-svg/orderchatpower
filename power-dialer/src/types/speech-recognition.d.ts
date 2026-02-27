export {}

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }

  // Unblocks TS in Vercel
  type SpeechRecognition = any
}
