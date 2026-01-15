import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

interface JitsiTokenOptions {
  roomName: string;
  userName: string;
  userEmail?: string;
  userId?: string;
  avatarUrl?: string;
  isModerator?: boolean;
  features?: {
    livestreaming?: boolean;
    recording?: boolean;
    transcription?: boolean;
    sipInboundCall?: boolean;
    sipOutboundCall?: boolean;
  };
}

interface JitsiTokenResult {
  token: string;
  appId: string;
  roomName: string;
  domain: string;
}

function formatPrivateKey(key: string): string {
  let formatted = key;
  
  // Handle literal \n strings (when stored as escaped in env vars)
  formatted = formatted.replace(/\\n/g, '\n');
  
  // If there are no newlines and it looks like a key, try to format it
  if (!formatted.includes('\n') && formatted.includes('-----BEGIN')) {
    // Try to detect if headers/footers are embedded without newlines
    formatted = formatted
      .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '-----BEGIN RSA PRIVATE KEY-----\n')
      .replace(/-----END RSA PRIVATE KEY-----/g, '\n-----END RSA PRIVATE KEY-----')
      .replace(/-----BEGIN PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n')
      .replace(/-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----');
    
    // Add newlines every 64 characters in the body if it's one long line
    const lines = formatted.split('\n');
    if (lines.length === 3) {
      const header = lines[0];
      const body = lines[1];
      const footer = lines[2];
      const bodyWithNewlines = body.match(/.{1,64}/g)?.join('\n') || body;
      formatted = `${header}\n${bodyWithNewlines}\n${footer}`;
    }
  }
  
  // Ensure the key has proper structure
  if (!formatted.startsWith('-----BEGIN')) {
    throw new Error('Invalid private key format: missing BEGIN header');
  }
  
  return formatted.trim();
}

export function generateJitsiToken(options: JitsiTokenOptions): JitsiTokenResult {
  const appId = process.env.JAAS_APP_ID;
  const apiKey = process.env.JAAS_API_KEY;
  const privateKey = process.env.JAAS_PRIVATE_KEY;

  if (!appId || !apiKey || !privateKey) {
    throw new Error('Jitsi JaaS credentials not configured. Please set JAAS_APP_ID, JAAS_API_KEY, and JAAS_PRIVATE_KEY environment variables.');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (3 * 60 * 60); // Token valid for 3 hours

  const payload = {
    aud: 'jitsi',
    context: {
      user: {
        id: options.userId || uuidv4(),
        name: options.userName,
        avatar: options.avatarUrl || '',
        email: options.userEmail || `${options.userName.replace(/\s+/g, '.').toLowerCase()}@example.com`,
        moderator: options.isModerator ? 'true' : 'false',
      },
      features: {
        livestreaming: options.features?.livestreaming ? 'true' : 'false',
        recording: options.features?.recording ? 'true' : 'false',
        transcription: options.features?.transcription ? 'true' : 'false',
        'sip-inbound-call': options.features?.sipInboundCall ? 'true' : 'false',
        'sip-outbound-call': options.features?.sipOutboundCall ? 'true' : 'false',
      },
      room: {
        regex: false,
      },
    },
    exp,
    iat: now,
    iss: 'chat',
    nbf: now,
    room: '*',
    sub: appId,
  };

  // Format the private key properly for RS256 signing
  let formattedPrivateKey: string;
  try {
    formattedPrivateKey = formatPrivateKey(privateKey);
  } catch (error) {
    throw new Error(`Invalid JAAS_PRIVATE_KEY format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const token = jwt.sign(payload, formattedPrivateKey, {
    algorithm: 'RS256',
    header: {
      alg: 'RS256',
      kid: apiKey,
      typ: 'JWT',
    },
  });

  return {
    token,
    appId,
    roomName: options.roomName,
    domain: '8x8.vc',
  };
}

export function isJaaSConfigured(): boolean {
  return !!(
    process.env.JAAS_APP_ID &&
    process.env.JAAS_API_KEY &&
    process.env.JAAS_PRIVATE_KEY
  );
}
