import { t } from './i18n';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './api';
export async function setupNative() {
  if (!isNative) return () => {};
  const back = await App.addListener('backButton', () => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      dialog.dispatchEvent(new Event('cancel'));
      return;
    }
    if (location.hash && location.hash !== '#chats') history.back();
    else void App.minimizeApp();
  });
  const active = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('kites:resume'));
  });
  return () => {
    void back.remove();
    void active.remove();
  };
}
export async function shareFile(name: string, content: string) {
  const path = `kites-${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { uri } = await Filesystem.writeFile({
    path,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: t('Save or share from Kites') });
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}
