import { JitsiMeeting as JitsiReactMeeting, JaaSMeeting } from '@jitsi/react-sdk';
import { Loader2, Video, AlertCircle } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLDivElement | null>(null);

  // Use JaaS if we have JWT and appId
  const useJaaS = !!(jwt && appId);
  const domain = useJaaS ? "8x8.vc" : "meet.jit.si";

  useEffect(() => {
    // Hide our loading overlay after 3 seconds to show Jitsi's own loading UI
    const hideTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const timeoutTimer = setTimeout(() => {
      if (loading) {
        setLoadTimeout(true);
      }
    }, 15000);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(timeoutTimer);
    };
  }, [loading]);

  const updateIframeSize = useCallback(() => {
    if (iframeRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const height = Math.max(rect.height, 500);
      iframeRef.current.style.height = `${height}px`;
      iframeRef.current.style.width = '100%';
    }
  }, []);

  useEffect(() => {
    updateIframeSize();
    window.addEventListener('resize', updateIframeSize);
    return () => window.removeEventListener('resize', updateIframeSize);
  }, [updateIframeSize]);

  const handleApiReady = (externalApi: any) => {
    console.log("Jitsi API ready, domain:", domain, "room:", roomName, "useJaaS:", useJaaS);
    setLoading(false);
    setError(null);
    
    setTimeout(updateIframeSize, 100);
    setTimeout(updateIframeSize, 500);
    setTimeout(updateIframeSize, 1000);
    
    externalApi.addEventListeners({
      videoConferenceJoined: () => {
        console.log("Jitsi: Video conference joined");
        updateIframeSize();
      },
      readyToClose: () => {
        console.log("Jitsi: Ready to close");
      },
    });
    
    if (onApiReady) onApiReady(externalApi);
  };

  if (error) {
    return (
      <div className={`relative w-full h-full min-h-[500px] overflow-hidden rounded-xl bg-zinc-900 flex items-center justify-center ${className}`}>
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
    <div 
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-zinc-900 ${className}`} 
      style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}
    >
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
      
      {useJaaS ? (
        <JaaSMeeting
          appId={appId!}
          roomName={roomName}
          jwt={jwt}
          configOverwrite={{
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
            prejoinConfig: {
              enabled: false,
            },
            enableLobby: false,
            hideLobbyButton: true,
            requireDisplayName: false,
            disableDeepLinking: true,
            disableModeratorIndicator: true,
            enableEmailInStats: false,
            disableInitialGUM: false,
            startAudioOnly: false,
            enableWelcomePage: false,
            readOnlyName: true,
            theme: {
              default: 'dark',
            },
            toolbarButtons: [
              'camera',
              'chat',
              'desktop',
              'filmstrip',
              'fullscreen',
              'hangup',
              'microphone',
              'participants-pane',
              'raisehand',
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
            MOBILE_APP_PROMO: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          }}
          userInfo={{
            displayName: displayName,
            email: `${displayName.replace(/\s+/g, '.').toLowerCase()}@example.com`
          }}
          onApiReady={handleApiReady}
          onReadyToClose={() => {
            console.log("Jitsi: Meeting ended by user");
          }}
          getIFrameRef={(iframeWrapper) => {
            if (iframeWrapper) {
              iframeRef.current = iframeWrapper;
              iframeWrapper.style.position = 'absolute';
              iframeWrapper.style.top = '0';
              iframeWrapper.style.left = '0';
              iframeWrapper.style.width = '100%';
              iframeWrapper.style.height = '100%';
              iframeWrapper.style.minHeight = '500px';
              iframeWrapper.style.background = '#18181b';
              iframeWrapper.style.border = 'none';
              iframeWrapper.style.borderRadius = '12px';
              updateIframeSize();
            }
          }}
        />
      ) : (
        <JitsiReactMeeting
          domain={domain}
          roomName={roomName}
          configOverwrite={{
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            disableModeratorIndicator: true,
            enableEmailInStats: false,
            theme: {
              default: 'dark',
            },
            toolbarButtons: [
              'camera',
              'chat',
              'desktop',
              'filmstrip',
              'fullscreen',
              'hangup',
              'microphone',
              'participants-pane',
              'raisehand',
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
            MOBILE_APP_PROMO: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          }}
          userInfo={{
            displayName: displayName,
            email: `${displayName.replace(/\s+/g, '.').toLowerCase()}@example.com`
          }}
          onApiReady={handleApiReady}
          onReadyToClose={() => {
            console.log("Jitsi: Meeting ended by user");
          }}
          getIFrameRef={(iframeWrapper) => {
            if (iframeWrapper) {
              iframeRef.current = iframeWrapper;
              iframeWrapper.style.position = 'absolute';
              iframeWrapper.style.top = '0';
              iframeWrapper.style.left = '0';
              iframeWrapper.style.width = '100%';
              iframeWrapper.style.height = '100%';
              iframeWrapper.style.minHeight = '500px';
              iframeWrapper.style.background = '#18181b';
              iframeWrapper.style.border = 'none';
              iframeWrapper.style.borderRadius = '12px';
              updateIframeSize();
            }
          }}
        />
      )}
    </div>
  );
}
