import { v4 as uuidv4 } from 'uuid';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
}

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

const defaultVoiceSettings: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
};

export async function getVoices(): Promise<Voice[]> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voices: ${response.statusText}`);
  }

  const data = await response.json();
  return data.voices;
}

export async function textToSpeech(
  text: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM',
  settings: Partial<VoiceSettings> = {}
): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const voiceSettings = { ...defaultVoiceSettings, ...settings };

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate speech: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function textToSpeechStream(
  text: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM',
  settings: Partial<VoiceSettings> = {}
): Promise<ReadableStream<Uint8Array>> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const voiceSettings = { ...defaultVoiceSettings, ...settings };

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to stream speech: ${error}`);
  }

  return response.body as ReadableStream<Uint8Array>;
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export async function getDefaultVoiceId(): Promise<string> {
  try {
    const voices = await getVoices();
    const rachel = voices.find(v => v.name.toLowerCase() === 'rachel');
    if (rachel) return rachel.voice_id;
    
    const premade = voices.find(v => v.category === 'premade');
    if (premade) return premade.voice_id;
    
    return voices[0]?.voice_id || DEFAULT_VOICE_ID;
  } catch (error) {
    console.error('Error getting default voice:', error);
    return DEFAULT_VOICE_ID;
  }
}

export interface SpeechToTextResult {
  text: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export async function speechToText(
  audioBuffer: Buffer,
  language: string = 'en',
  mimeType: string = 'audio/webm'
): Promise<SpeechToTextResult> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', audioBlob, `audio.${extension}`);
  formData.append('model_id', 'scribe_v2');
  formData.append('language', language);

  const response = await fetch(
    `${ELEVENLABS_API_URL}/speech-to-text`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to transcribe speech: ${error}`);
  }

  return response.json();
}

export async function getConversationalAgentSignedUrl(agentId: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  if (!agentId) {
    throw new Error('Agent ID is required');
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get signed URL: ${error}`);
  }

  const data = await response.json();
  return data.signed_url;
}
