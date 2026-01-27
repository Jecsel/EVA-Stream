import { JitsiMeeting as JitsiReactMeeting } from '@jitsi/react-sdk';
import { Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from 'react';

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
  const apiRef = useRef<any>(null);
  const eventHandlersRef = useRef<{ event: string; handler: Function }[]>([]);

  useEffect(() => {
    return () => {
      if (apiRef.current && eventHandlersRef.current.length > 0) {
        eventHandlersRef.current.forEach(({ event, handler }) => {
          try {
            apiRef.current.removeEventListener(event, handler);
          } catch (e) {
            console.log('Could not remove event listener:', event);
          }
        });
        eventHandlersRef.current = [];
      }
    };
  }, []);

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
          apiRef.current = externalApi;
          eventHandlersRef.current = [];

          const registerEvent = (event: string, handler: Function) => {
            externalApi.addEventListener(event, handler);
            eventHandlersRef.current.push({ event, handler });
          };
          
          // Auto-start cloud recording when using JaaS
          if (jwt) {
            const recordingHandler = () => {
              console.log('Conference joined, starting cloud recording...');
              setTimeout(() => {
                try {
                  externalApi.executeCommand('startRecording', {
                    mode: 'file',
                    shouldShare: true,
                  });
                  console.log('Cloud recording started automatically');
                } catch (err) {
                  console.error('Failed to start recording:', err);
                }
              }, 2000);
            };
            registerEvent('videoConferenceJoined', recordingHandler);
          }
          
          // Listen for transcription/subtitle events from Jitsi
          if (onTranscriptionReceived) {
            const subtitlesHandler = (event: any) => {
              console.log('Subtitles received:', event);
              onTranscriptionReceived(
                event.text,
                event.participant?.name || 'Unknown',
                event.isFinal ?? true
              );
            };
            registerEvent('subtitlesReceived', subtitlesHandler);
            
            const transcriptionChunkHandler = (event: any) => {
              console.log('Transcription chunk received:', event);
              onTranscriptionReceived(
                event.text,
                event.participant?.name || 'Unknown',
                event.final ?? true
              );
            };
            registerEvent('transcriptionChunkReceived', transcriptionChunkHandler);
            
            const endpointTextHandler = (event: any) => {
              const text = event.data?.text || event.data?.transcript;
              if (text) {
                console.log('Endpoint text message received:', event);
                onTranscriptionReceived(
                  text,
                  event.senderInfo?.displayName || 'Unknown',
                  true
                );
              }
            };
            registerEvent('endpointTextMessageReceived', endpointTextHandler);

            const captionsHandler = () => {
              setTimeout(() => {
                try {
                  externalApi.executeCommand('toggleSubtitles');
                  console.log('Auto-enabled closed captions for transcription');
                } catch (err) {
                  console.log('Could not auto-enable captions:', err);
                }
              }, 3000);
            };
            registerEvent('videoConferenceJoined', captionsHandler);
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
