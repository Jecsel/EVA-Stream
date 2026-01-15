import { JitsiMeeting as JitsiReactMeeting } from '@jitsi/react-sdk';
import { Loader2, Video, AlertCircle } from "lucide-react";
import { useState, useEffect } from 'react';

interface JitsiMeetingProps {
  roomName: string;
  displayName: string;
  onApiReady?: (api: any) => void;
  className?: string;
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
  const [error, setError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState(false);

  const formattedRoomName = appId ? `${appId}/${roomName}` : roomName;
  const domain = jwt ? "8x8.vc" : "meet.jit.si";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoadTimeout(true);
      }
    }, 15000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleApiReady = (externalApi: any) => {
    console.log("Jitsi API ready, domain:", domain, "room:", formattedRoomName);
    setLoading(false);
    setError(null);
    
    externalApi.addEventListeners({
      videoConferenceJoined: () => {
        console.log("Jitsi: Video conference joined");
      },
      readyToClose: () => {
        console.log("Jitsi: Ready to close");
      },
    });
    
    if (onApiReady) onApiReady(externalApi);
  };

  if (error) {
    return (
      <div className={`relative w-full h-full min-h-[400px] overflow-hidden rounded-xl bg-zinc-900 flex items-center justify-center ${className}`}>
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="text-white font-medium">Failed to load video conference</p>
          <p className="text-muted-foreground text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-[400px] overflow-hidden rounded-xl bg-zinc-900 ${className}`} style={{ minHeight: '400px' }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
          <div className="flex flex-col items-center gap-4">
            <Video className="h-12 w-12 text-primary animate-pulse" />
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-white font-medium">Joining Secure Meeting...</p>
            <p className="text-muted-foreground text-sm">Connecting to {domain}</p>
            {loadTimeout && (
              <p className="text-yellow-500 text-xs mt-2">
                Taking longer than expected. Please wait...
              </p>
            )}
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
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          theme: {
            default: 'dark',
          },
          toolbarButtons: [
            'camera',
            'chat',
            'closedcaptions',
            'desktop',
            'filmstrip',
            'fullscreen',
            'hangup',
            'microphone',
            'noisesuppression',
            'participants-pane',
            'raisehand',
            'recording',
            'select-background',
            'settings',
            'tileview',
            'toggle-camera',
            'videoquality',
          ],
        }}
        interfaceConfigOverwrite={{
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#18181b',
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          HIDE_INVITE_MORE_HEADER: true,
        }}
        userInfo={{
          displayName: displayName,
          email: `${displayName.replace(/\s+/g, '.').toLowerCase()}@example.com`
        }}
        onApiReady={handleApiReady}
        onReadyToClose={() => {
          console.log("Jitsi: Meeting ended by user");
        }}
        getIFrameRef={(iframeRef) => {
          if (iframeRef) {
            iframeRef.style.height = '100%';
            iframeRef.style.width = '100%';
            iframeRef.style.minHeight = '400px';
            iframeRef.style.background = '#18181b';
            iframeRef.style.border = 'none';
            iframeRef.style.borderRadius = '12px';
          }
        }}
      />
    </div>
  );
}
