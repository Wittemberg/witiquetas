export interface SessionInfo {
  sessionId: string;
  tabId: string;
  isDuplicated: boolean;
}

let currentActiveSessionInfo: SessionInfo | null = null;
let presenceChannel: BroadcastChannel | null = null;
const claimedSessionIds = new Set<string>();

export function setupPresenceBroadcastListener(onConflict?: (claimedSid: string) => void): void {
  if (typeof BroadcastChannel === 'undefined' || presenceChannel) return;

  try {
    presenceChannel = new BroadcastChannel('witiquetas_presence_channel');
    presenceChannel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'PING_CLAIM' && (claimedSessionIds.has(data.sessionId) || currentActiveSessionInfo?.sessionId === data.sessionId)) {
        presenceChannel?.postMessage({
          type: 'PONG_TAKEN',
          sessionId: data.sessionId,
          senderTabId: currentActiveSessionInfo?.tabId || 'active-tab',
        });
        if (onConflict) onConflict(data.sessionId);
      }
    };
  } catch {
    // BroadcastChannel não suportado no ambiente (ex: SSR)
  }
}

export async function resolveTabSessionId(
  storageOverride?: Storage,
  winNameOverride?: string,
  timeoutMs = 80
): Promise<SessionInfo> {
  if (currentActiveSessionInfo) {
    return currentActiveSessionInfo;
  }

  setupPresenceBroadcastListener();

  const storage = storageOverride || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  let candidateTabId = '';
  if (winNameOverride !== undefined) {
    if (winNameOverride && winNameOverride.startsWith('witiquetas_tab_')) {
      candidateTabId = winNameOverride;
    }
  } else {
    try {
      if (typeof window !== 'undefined' && window.name && window.name.startsWith('witiquetas_tab_')) {
        candidateTabId = window.name;
      }
    } catch {}
  }

  let candidateSid = '';
  if (candidateTabId && storage) {
    candidateSid = storage.getItem(`witiquetas_sid_${candidateTabId}`) || '';
  }
  if (!candidateSid && storage) {
    candidateSid = storage.getItem('witiquetas_editing_session_id') || '';
  }

  let isTaken = false;

  if (candidateSid && presenceChannel) {
    isTaken = await new Promise<boolean>((resolve) => {
      let resolved = false;
      const handler = (event: MessageEvent) => {
        if (event.data && event.data.type === 'PONG_TAKEN' && event.data.sessionId === candidateSid) {
          if (!resolved) {
            resolved = true;
            if (presenceChannel) presenceChannel.removeEventListener('message', handler);
            resolve(true);
          }
        }
      };

      if (presenceChannel) presenceChannel.addEventListener('message', handler);

      try {
        presenceChannel?.postMessage({
          type: 'PING_CLAIM',
          sessionId: candidateSid,
        });
      } catch {}

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (presenceChannel) presenceChannel.removeEventListener('message', handler);
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  let finalSid = candidateSid;
  let finalTabId = candidateTabId;
  let isDuplicated = false;

  if (isTaken || !finalSid) {
    isDuplicated = isTaken;
    finalSid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    finalTabId = `witiquetas_tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  if (!finalTabId) {
    finalTabId = `witiquetas_tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  try {
    if (typeof window !== 'undefined' && winNameOverride === undefined) {
      window.name = finalTabId;
    }
  } catch {}

  if (storage) {
    try {
      storage.setItem(`witiquetas_sid_${finalTabId}`, finalSid);
      storage.setItem('witiquetas_editing_session_id', finalSid);
    } catch {}
  }

  claimedSessionIds.add(finalSid);

  currentActiveSessionInfo = {
    sessionId: finalSid,
    tabId: finalTabId,
    isDuplicated,
  };

  return currentActiveSessionInfo;
}

export function getTabSessionIdSync(storageOverride?: Storage, winNameOverride?: string): string {
  if (currentActiveSessionInfo) return currentActiveSessionInfo.sessionId;
  let tabId = winNameOverride || '';
  try {
    if (!tabId && typeof window !== 'undefined') tabId = window.name;
  } catch {}
  if (!tabId) tabId = 'witiquetas_tab_init';
  const storage = storageOverride || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  let sid = storage ? storage.getItem(`witiquetas_sid_${tabId}`) || storage.getItem('witiquetas_editing_session_id') || '' : '';
  if (!sid) {
    sid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }
  return sid;
}

export function resetInMemSessionForTest(keepChannel = false) {
  currentActiveSessionInfo = null;
  if (!keepChannel) {
    claimedSessionIds.clear();
    if (presenceChannel) {
      presenceChannel.close();
      presenceChannel = null;
    }
  }
}
