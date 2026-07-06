// App entry point: styles, routing, and action wiring.

import './style.css';

import { session, setUser, isLoggedIn } from './session.js';
import { Auth, setAuthLostHandler, setRetryNoticeHandler } from './api.js';
import { state } from './state.js';
import { toggleTheme } from './theme.js';
import {
  renderIcons, transitionToView, showToast, closeModal, copyToClipboard,
  togglePasswordVisibility, registerActions, initDispatch,
} from './ui.js';
import {
  switchAuthTab, handleAuthSubmit, resendVerificationEmail,
  enterDashboardUnverified, handleSupabaseRedirect, handleLogout,
} from './views/auth.js';
import {
  loadDashboard, navigateToFolder, handleFolderClick,
  openCreateFolderModal, submitCreateFolder, openRenameModal, submitRename,
  openMoveModal, submitMove, deleteFile, deleteFolder, downloadFile,
  triggerUpload, dismissUploadPanel, handleFilesSelected,
  setViewMode, setSearchQuery, clearSearch, initDropZone,
} from './views/files.js';
import {
  openShareModal, submitCreateShare, revokeShare,
  loadPublicFileDetails, downloadPublicFile,
} from './views/share.js';

// A 401 anywhere bounces the user cleanly to the login screen.
setAuthLostHandler(() => { handleLogout(); });
// Show a gentle notice the first time a request has to retry (e.g. Render cold start).
let noticeShown = false;
setRetryNoticeHandler(() => {
  if (noticeShown) return;
  noticeShown = true;
  showToast('Waking up the server — this can take a moment…');
  setTimeout(() => { noticeShown = false; }, 15_000);
});

function idOrNull(el) { return el.dataset.id ? el.dataset.id : null; }

registerActions({
  // auth
  'auth-tab': (el) => switchAuthTab(el.dataset.tab),
  'auth-submit': (el, e) => handleAuthSubmit(e),
  'toggle-password': (el) => togglePasswordVisibility(el.dataset.target),
  'resend-verification': () => resendVerificationEmail(),
  'enter-unverified': () => enterDashboardUnverified(),
  'logout': () => handleLogout(),
  'go-login': () => handleLogout(),
  // navigation
  'nav-folder': (el) => navigateToFolder(idOrNull(el)),
  'nav-crumb': (el) => navigateToFolder(idOrNull(el)),
  'open-folder': (el) => handleFolderClick(el.dataset.id, el.dataset.name),
  // folders / files
  'open-create-folder': () => openCreateFolderModal(),
  'create-folder': (el, e) => submitCreateFolder(e),
  'rename': (el) => openRenameModal(el.dataset.type, el.dataset.id, el.dataset.name),
  'rename-submit': (el, e) => submitRename(e),
  'move': (el) => openMoveModal(el.dataset.type, el.dataset.id, el.dataset.name),
  'move-submit': (el, e) => submitMove(e),
  'delete-file': (el) => deleteFile(el.dataset.id),
  'delete-folder': (el) => deleteFolder(el.dataset.id),
  'download': (el) => downloadFile(el.dataset.id),
  // upload
  'trigger-upload': () => triggerUpload(),
  'dismiss-upload': () => dismissUploadPanel(),
  // browser chrome
  'set-view': (el) => setViewMode(el.dataset.view),
  'clear-search': () => clearSearch(),
  // sharing
  'share': (el) => openShareModal(el.dataset.id, el.dataset.name),
  'create-share': (el, e) => submitCreateShare(e),
  'revoke-share': (el) => revokeShare(el.dataset.id, el.dataset.file),
  'copy': (el) => copyToClipboard(el.dataset.text),
  'download-public': () => downloadPublicFile(),
  // misc
  'close-modal': (el) => { closeModal(el.dataset.modal); state.activeModalItem = null; },
  'dismiss-toast': (el) => el.closest('.toast')?.remove(),
  'toggle-theme': () => toggleTheme(),
});

async function initializeApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  const shareToken = urlParams.get('s') || (hash.startsWith('#/s/') ? hash.substring(4) : null);
  const isSupabaseRedirect = !hash.startsWith('#/s/') && /(access_token|error_description|error)=/.test(hash);

  if (shareToken) {
    transitionToView('public-view');
    loadPublicFileDetails(shareToken);
    return;
  }
  if (isSupabaseRedirect) {
    await handleSupabaseRedirect(hash);
    return;
  }

  if (!isLoggedIn()) {
    transitionToView('auth-view');
    return;
  }

  // We have a token — show the right screen IMMEDIATELY from the cached user so a
  // reload never flashes the login page. Then confirm with the server in the
  // background: a real 401 logs out via the api client's authLostHandler; a
  // transient/offline error is ignored so we don't kick out a valid session.
  const cached = session.user;
  if (cached && !cached.email_verified) {
    transitionToView('verify-view');
  } else {
    transitionToView('dashboard-view'); // verified, or unknown (optimistic)
    loadDashboard();
  }

  try {
    const fresh = await Auth.me();
    const wasVerified = session.user?.email_verified;
    setUser(fresh);
    if (!fresh.email_verified) {
      transitionToView('verify-view');
    } else if (!cached || !wasVerified) {
      // First confirmation (no cache) or just-verified — (re)enter the dashboard.
      transitionToView('dashboard-view');
      loadDashboard();
    }
  } catch {
    // 401 already handled by the api client (logout). Ignore transient errors and
    // keep the user where they are — the session stays intact for the next reload.
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // One global pass renders static icons (modals, upload panel) outside the view
  // tree; every later pass is scoped to the container that changed.
  renderIcons();
  initDispatch();
  document.getElementById('file-uploader').addEventListener('change', handleFilesSelected);
  document.getElementById('search-input').addEventListener('input', (e) => setSearchQuery(e.target.value));
  setViewMode(state.viewMode); // reflect the persisted mode on the toggle buttons
  initDropZone();
  initializeApp();
});
