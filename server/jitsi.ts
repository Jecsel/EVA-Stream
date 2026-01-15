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
    iss: 'chat',
    nbf: now,
    room: '*', // Allow access to any room - can be restricted to specific room name
    sub: appId,
  };

  // Sign the JWT with RS256 algorithm
  // The private key needs to have newlines properly formatted
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
  
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
