import { JitsiMeeting as JitsiReactMeeting } from '@jitsi/react-sdk';
import { Loader2 } from "lucide-react";
import { useState } from 'react';

interface JitsiMeetingProps {
  roomName: string;
  displayName: string;
  onApiReady?: (api: any) => void;
  className?: string;
  // Optional JaaS properties for future integration
  jwt?: string;
  appId?: string;
}

export function JitsiMeeting({ 
  roomName, 
  displayName, 
  onApiReady, 
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
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          theme: {
            default: 'dark',
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
            'hangup',
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
