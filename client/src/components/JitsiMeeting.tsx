import { JitsiMeeting as JitsiReactMeeting } from '@jitsi/react-sdk';
import { Loader2 } from "lucide-react";
import { useState } from 'react';

interface JitsiMeetingProps {
  roomName: string;
  displayName: string;
  onApiReady?: (api: any) => void;
  onTranscriptionReceived?: (text: string, participant: string, isFinal: boolean) => void;
  className?: string;
  // Optional JaaS properties for future integration
  jwt?: string;
  appId?: string;
}

export function JitsiMeeting({ 
  roomName, 
  displayName, 
  onApiReady,
  onTranscriptionReceived,
  className,
  jwt,
  appId
}: JitsiMeetingProps) {
  const [loading, setLoading] = useState(true);

  // If using JaaS (appId provided), the room name format is typically "vpaas-magic-cookie-id/roomName"
  const formattedRoomName = appId ? `${appId}/${roomName}` : roomName;
  
  // Use 8x8.vc if a JWT is provided (indicating JaaS), otherwise fallback to the free community server
  const domain = jwt ? "8x8.vc" : "meet.jit.si";

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-xl bg-background ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">Joining Secure Meeting...</p>
          </div>
        </div>
      )}
      
      <JitsiReactMeeting
        domain={domain}
        roomName={formattedRoomName}
        jwt={jwt}
        configOverwrite={{
          startWithAudioMuted: false,
          startWithVideoMuted: true,
          theme: {
            default: 'dark',
          },
          // Enable cloud recording features
          fileRecordingsEnabled: true,
          localRecording: {
            enabled: false,
          },
          recordingService: {
            enabled: true,
            sharingEnabled: true,
          },
          // Enable live streaming/recording transcription
          liveStreamingEnabled: true,
          transcribingEnabled: true,
          // Enable transcription/closed captions
          transcription: {
            enabled: true,
            autoCaptionOnRecord: true,
            useAppLanguage: true,
          },
          // Enable subtitles/closed captions for transcription
          p2p: {
            enabled: false, // Disable P2P for better transcription support
          },
          toolbarButtons: [
            'camera',
            'chat',
            'closedcaptions',
            'desktop',
            'download',
            'embedmeeting',
            'etherpad',
            'feedback',
            'filmstrip',
            'fullscreen',
            'help',
            'highlight',
            'invite',
            'linktosalesforce',
            'livestreaming',
            'microphone',
            'noisesuppression',
            'participants-pane',
            'profile',
            'raisehand',
            'recording',
            'security',
            'select-background',
            'settings',
            'shareaudio',
            'sharedvideo',
            'shortcuts',
            'stats',
            'tileview',
            'toggle-camera',
            'videoquality',
            'whiteboard',
          ],
        }}
        interfaceConfigOverwrite={{
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#202124',
          TOOLBAR_ALWAYS_VISIBLE: true,
        }}
        userInfo={{
          displayName: displayName,
          email: `${displayName.replace(/\s+/g, '.').toLowerCase()}@example.com`
        }}
        onApiReady={(externalApi) => {
          setLoading(false);
          
          // Auto-start cloud recording when using JaaS
          if (jwt) {
            // Wait for the conference to be joined, then start recording
            externalApi.addEventListener('videoConferenceJoined', () => {
              console.log('Conference joined, starting cloud recording...');
              // Small delay to ensure connection is stable
              setTimeout(() => {
                try {
                  externalApi.executeCommand('startRecording', {
                    mode: 'file', // Cloud recording mode
                    shouldShare: true,
                  });
                  console.log('Cloud recording started automatically');
                } catch (err) {
                  console.error('Failed to start recording:', err);
                }
              }, 2000);
            });
          }
          
          // Listen for transcription/subtitle events from Jitsi
          if (onTranscriptionReceived) {
            // Listen for subtitles (real-time captions)
            externalApi.addEventListener('subtitlesReceived', (event: {
              text: string;
              participant: { name: string };
              isFinal?: boolean;
            }) => {
              console.log('Subtitles received:', event);
              onTranscriptionReceived(
                event.text,
                event.participant?.name || 'Unknown',
                event.isFinal ?? true
              );
            });
            
            // Listen for transcription chunks (alternative event)
            externalApi.addEventListener('transcriptionChunkReceived', (event: {
              text: string;
              participant: { name: string };
              final?: boolean;
            }) => {
              console.log('Transcription chunk received:', event);
              onTranscriptionReceived(
                event.text,
                event.participant?.name || 'Unknown',
                event.final ?? true
              );
            });
            
            // Listen for endpoint text message (another transcription event type)
            externalApi.addEventListener('endpointTextMessageReceived', (event: {
              data: {
                text?: string;
                transcript?: string;
              };
              senderInfo?: { displayName: string };
            }) => {
              const text = event.data?.text || event.data?.transcript;
              if (text) {
                console.log('Endpoint text message received:', event);
                onTranscriptionReceived(
                  text,
                  event.senderInfo?.displayName || 'Unknown',
                  true
                );
              }
            });

            // Auto-enable closed captions after joining
            externalApi.addEventListener('videoConferenceJoined', () => {
              setTimeout(() => {
                try {
                  // Toggle closed captions on to start receiving transcription
                  externalApi.executeCommand('toggleSubtitles');
                  console.log('Auto-enabled closed captions for transcription');
                } catch (err) {
                  console.log('Could not auto-enable captions:', err);
                }
              }, 3000);
            });
          }
          
          if (onApiReady) onApiReady(externalApi);
        }}
        getIFrameRef={(iframeRef) => {
          iframeRef.style.height = '100%';
          iframeRef.style.width = '100%';
          iframeRef.style.background = '#202124';
        }}
      />
    </div>
  );
}
