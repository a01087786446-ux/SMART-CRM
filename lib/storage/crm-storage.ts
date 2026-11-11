// SMART CRM 데이터 저장 모듈

const STORAGE_KEYS = {
  customers: "smart-crm-customers",
  autoFollowupDone: "smart-crm-auto-followup-done",
} as const;

type StorageKey = keyof typeof STORAGE_KEYS;

// 저장된 데이터 불러오기
export function loadCrmData<T>(
  key: StorageKey
): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = localStorage.getItem(
    STORAGE_KEYS[key]
  );

  if (saved === null) {
    return null;
  }

  return JSON.parse(saved) as T;
}

// 데이터 저장하기
export function saveCrmData<T>(
  key: StorageKey,
  data: T
): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    STORAGE_KEYS[key],
    JSON.stringify(data)
  );
}