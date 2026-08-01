import { useMemo, useRef } from 'react';
import { resolveBackendUrl } from '../../utils/network';
import { createLogger, logWarn } from '../../utils/logger';

const log = createLogger('OffScreenBg');

const MAX_MEDIA_SIZE_BYTES = 200 * 1024 * 1024;

const useOffScreenBackground = ({
  outputKey,
  settings,
  applySettings,
  ensureValidToken,
  showToast
}) => {
  const fileInputRef = useRef(null);
  const clientTypeRef = useRef(typeof window !== 'undefined' && window.electronAPI ? 'desktop' : 'web');

  const hasOffScreenMedia = useMemo(() => {
    const media = settings.offScreenMedia;
    return Boolean(media && (media.url || media.dataUrl));
  }, [settings.offScreenMedia]);

  const uploadedMediaName = useMemo(() => {
    const media = settings.offScreenMedia;
    return settings.offScreenMediaName || media?.name || '';
  }, [settings.offScreenMedia, settings.offScreenMediaName]);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMediaSelection = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    log.debug('Off-screen media selected:', file.name, `(${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      showToast({
        title: 'Unsupported file',
        message: 'Please choose an image or video.',
        variant: 'error',
      });
      resetFileInput();
      return;
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showToast({
        title: 'File too large',
        message: `Files must be ${Math.round(MAX_MEDIA_SIZE_BYTES / (1024 * 1024))}MB or smaller. Selected file is ${sizeMB}MB.`,
        variant: 'error',
      });
      resetFileInput();
      return;
    }

    try {
      const token = await ensureValidToken(clientTypeRef.current);
      const uploadUrl = resolveBackendUrl('/api/media/backgrounds');
      const formData = new FormData();
      formData.append('background', file);
      formData.append('outputKey', `${outputKey}-offscreen`);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch {
        }
        throw new Error(errorMessage);
      }

      const payload = await response.json();

      applySettings({
        offScreenMedia: {
          url: payload.url,
          mimeType: payload.mimeType ?? file.type,
          name: payload.originalName ?? file.name,
          size: payload.size ?? file.size,
          uploadedAt: payload.uploadedAt ?? Date.now(),
        },
        offScreenMediaName: payload.originalName ?? file.name,
      });

      showToast({
        title: 'Off-screen image ready',
        message: `${payload.originalName ?? file.name} uploaded successfully.`,
        variant: 'success',
      });
      log.info('Off-screen media uploaded:', payload.originalName ?? file.name);
    } catch (error) {
      showToast({
        title: 'Upload failed',
        message: error?.message || 'Could not upload the media file.',
        variant: 'error',
      });
    } finally {
      resetFileInput();
    }
  };

  const triggerFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const clearMedia = () => {
    applySettings({
      offScreenMedia: null,
      offScreenMediaName: '',
    });
    showToast({
      title: 'Off-screen image removed',
      message: 'The off-screen image has been removed.',
      variant: 'success',
    });
  };

  const validateExistingMedia = async () => {
    const hasMediaUrl = Boolean(settings.offScreenMedia?.url);
    if (!hasMediaUrl) return;
    if (settings.offScreenMedia?.bundled) return;

    const mediaUrl = resolveBackendUrl(settings.offScreenMedia.url);
    try {
      const response = await fetch(mediaUrl, { method: 'HEAD' });
      if (!response.ok) {
        logWarn(`${outputKey}: Off-screen media not found, clearing reference`);
        applySettings({
          offScreenMedia: null,
          offScreenMediaName: '',
        });
      }
    } catch (error) {
      logWarn(`${outputKey}: Could not validate off-screen media:`, error.message);
    }
  };

  return {
    fileInputRef,
    handleMediaSelection,
    triggerFileDialog,
    hasOffScreenMedia,
    uploadedMediaName,
    clearMedia,
    validateExistingMedia,
  };
};

export default useOffScreenBackground;
