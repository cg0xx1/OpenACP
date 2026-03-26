import type { OpenACPPlugin } from '../../core/plugin/types.js'
import { SpeechService, GroqSTT, EdgeTTS } from './exports.js'
import type { SpeechServiceConfig } from './exports.js'

const speechPlugin: OpenACPPlugin = {
  name: '@openacp/speech',
  version: '1.0.0',
  description: 'Text-to-speech and speech-to-text with pluggable providers',
  optionalPluginDependencies: { '@openacp/file-service': '^1.0.0' },
  permissions: ['services:register'],

  async setup(ctx) {
    const config = ctx.pluginConfig as Record<string, unknown>
    const groqApiKey = config.groqApiKey as string | undefined
    const ttsVoice = config.ttsVoice as string | undefined

    const sttProvider = groqApiKey ? 'groq' : null
    const speechConfig: SpeechServiceConfig = {
      stt: {
        provider: sttProvider,
        providers: groqApiKey ? { groq: { apiKey: groqApiKey } } : {},
      },
      tts: {
        provider: 'edge-tts',
        providers: {},
      },
    }

    const service = new SpeechService(speechConfig)

    if (groqApiKey) {
      service.registerSTTProvider('groq', new GroqSTT(groqApiKey))
    }
    service.registerTTSProvider('edge-tts', new EdgeTTS(ttsVoice))

    ctx.registerService('speech', service)
    ctx.log.info('Speech service ready')
  },
}

export default speechPlugin
