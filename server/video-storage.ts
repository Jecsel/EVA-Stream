import { objectStorageClient, ObjectStorageService } from "./replit_integrations/object_storage";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const objectStorageService = new ObjectStorageService();

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

export async function downloadAndStoreVideo(
  jaasVideoUrl: string,
  recordingId: string,
  onProgress?: (status: string) => void
): Promise<{ storedVideoPath: string }> {
  const emit = (msg: string) => {
    console.log(`[VideoStorage] ${msg}`);
    onProgress?.(msg);
  };

  emit("Downloading video from JaaS...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(jaasVideoUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download video from JaaS: HTTP ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body received from JaaS");
    }

    const contentLength = response.headers.get("content-length");
    const fileSizeMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(1) : "unknown";
    const videoContentType = "video/mp4";
    emit(`Streaming video (${fileSizeMB} MB) to storage as ${videoContentType}...`);

    const privateDir = objectStorageService.getPrivateObjectDir();
    const objectPath = `${privateDir}/recordings/${recordingId}.mp4`;
    const { bucketName, objectName } = parseObjectPath(objectPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    const writeStream = file.createWriteStream({
      contentType: videoContentType,
      metadata: {
        metadata: {
          recordingId,
          originalUrl: jaasVideoUrl.substring(0, 200),
          storedAt: new Date().toISOString(),
        },
      },
      resumable: true,
    });

    const nodeReadable = Readable.fromWeb(response.body as any);

    await pipeline(nodeReadable, writeStream);

    const storedVideoPath = `/objects/recordings/${recordingId}.mp4`;
    emit(`Video stored successfully at ${storedVideoPath}`);

    return { storedVideoPath };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fixStoredVideoContentType(storedVideoPath: string): Promise<boolean> {
  try {
    const file = await getStoredVideoFile(storedVideoPath);
    const [metadata] = await file.getMetadata();

    if (metadata.contentType !== "video/mp4") {
      console.log(`[VideoStorage] Fixing content type from "${metadata.contentType}" to "video/mp4" for ${storedVideoPath}`);
      await file.setMetadata({ contentType: "video/mp4" });
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[VideoStorage] Failed to fix content type for ${storedVideoPath}:`, error);
    return false;
  }
}

export async function getStoredVideoFile(storedVideoPath: string) {
  const objectStorageService = new ObjectStorageService();
  return objectStorageService.getObjectEntityFile(storedVideoPath);
}

export async function deleteStoredVideo(storedVideoPath: string): Promise<boolean> {
  try {
    const file = await getStoredVideoFile(storedVideoPath);
    await file.delete();
    return true;
  } catch {
    return false;
  }
}
