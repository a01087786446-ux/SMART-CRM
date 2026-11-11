
"use client";

import { useEffect, useState } from "react";

type CustomerDraft = {
  name: string;
  phone: string;
  carrier: string;
  device: string;
  plan: string;
  openDate: string;
  endDate: string;
};

const STORAGE_KEY = "smart-crm-customers";
const BACKUP_KEY = "smart-crm-customers-ocr-import-backup";

const fields: {
  key: keyof CustomerDraft;
  label: string;
  type?: string;
}[] = [
  { key: "name", label: "고객명" },
  { key: "phone", label: "휴대폰 번호", type: "tel" },
  { key: "carrier", label: "통신사" },
  { key: "device", label: "가입 기기" },
  { key: "plan", label: "요금제" },
  { key: "openDate", label: "개통일", type: "date" },
  { key: "endDate", label: "약정 종료일", type: "date" },
];

export default function DriveReviewPage() {
  const [fileId, setFileId] = useState("");
  const [loadedFileId, setLoadedFileId] = useState("");
  const [fileName, setFileName] = useState("");

  const [customer, setCustomer] =
    useState<CustomerDraft | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    setFileId(params.get("id") || "");
  }, []);

  async function runOcr() {
    if (!fileId.trim()) {
      setError("Google Drive 파일 ID가 필요합니다.");
      return;
    }

    setLoading(true);
    setError("");
    setSaveError("");
    setCustomer(null);
    setLoadedFileId("");
    setReviewed(false);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/google/drive-scan-ocr?id=${encodeURIComponent(
          fileId.trim()
        )}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success || !data.customer) {
        throw new Error(
          data.error || "고객정보를 불러오지 못했습니다."
        );
      }

      const result = data.customer;

      setCustomer({
        name: result.name || "",
        phone: result.phone || "",
        carrier: result.carrier || "",
        device: result.device || "",
        plan: result.plan || "",
        openDate: result.openDate || "",
        endDate: result.endDate || "",
      });

      setFileName(data.fileName || "");
      setLoadedFileId(fileId.trim());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "OCR 실행 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  function updateField(
    key: keyof CustomerDraft,
    value: string
  ) {
    setCustomer((previous) =>
      previous
        ? { ...previous, [key]: value }
        : previous
    );

    // 수정했다면 다시 검토 확인이 필요합니다.
    setReviewed(false);
    setSaveError("");
  }

  function saveToCrm() {
    setSaveError("");

    if (!customer || saved) return;

    if (fileId.trim() !== loadedFileId) {
      setSaveError(
        "파일 ID가 변경되었습니다. OCR을 다시 실행해 주세요."
      );
      return;
    }

    if (!reviewed) {
      setSaveError(
        "원본 신청서와 대조한 후 검토 완료를 선택하세요."
      );
      return;
    }

    const name = customer.name.trim();
    const phoneDigits = customer.phone.replace(/\D/g, "");

    if (!name) {
      setSaveError("고객명을 입력해 주세요.");
      return;
    }

    if (!/^010\d{8}$/.test(phoneDigits)) {
      setSaveError(
        "010으로 시작하는 올바른 휴대폰 번호를 입력해 주세요."
      );
      return;
    }

    const formattedPhone = phoneDigits.replace(
      /^(010)(\d{4})(\d{4})$/,
      "$1-$2-$3"
    );

    try {
      // 항상 기존 고객 목록을 먼저 읽습니다.
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing: unknown = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(existing)) {
        throw new Error(
          "기존 고객 데이터 형식이 올바르지 않습니다."
        );
      }

      // 기존 고객정보 형식 확인
      const invalid = existing.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
      );

      if (invalid) {
        throw new Error(
          "기존 고객 데이터를 확인할 수 없어 저장을 중단했습니다."
        );
      }

      // 전화번호 기준 중복 확인
      const duplicate = existing.some(
        (item) =>
          typeof item.phone === "string" &&
          item.phone.replace(/\D/g, "") === phoneDigits
      );

      if (duplicate) {
        setSaveError(
          "이미 같은 휴대폰 번호의 고객이 등록되어 있습니다. 기존 고객정보를 확인해 주세요."
        );
        return;
      }

      const confirmed = window.confirm(
        `${name} 고객을 SMART CRM에 신규 등록하시겠습니까?\n\n` +
        `휴대폰 번호: ${formattedPhone}\n\n` +
        "원본 신청서와 대조한 정보만 등록해 주세요."
      );

      if (!confirmed) return;

      // 기존 고객 ID와 충돌하지 않는 ID 생성
      const highestId = existing.reduce(
        (highest, item) =>
          typeof item.id === "number"
            ? Math.max(highest, item.id)
            : highest,
        0
      );

      const newId = Math.max(
        Date.now(),
        highestId + 1
      );

const openDateText = customer.openDate.trim();
let firstFollowupDate = "";

if (/^\d{4}-\d{2}-\d{2}$/.test(openDateText)) {
  const [year, month, day] = openDateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  ) {
    date.setUTCDate(date.getUTCDate() + 7);
    firstFollowupDate = date.toISOString().slice(0, 10);
  }
}

      const newCustomer = {
        id: newId,
        name,
        phone: formattedPhone,
        carrier: customer.carrier.trim(),
        device: customer.device.trim(),
        plan: customer.plan.trim(),
        openDate: customer.openDate,
        endDate: customer.endDate,

        // 개통 완료 여부는 별도로 확인
        status: "확인필요",

        history: [],
        
followupDate: firstFollowupDate,

        followupStatus: "연락예정",
      };

      // 최초 OCR 등록 전 기존 데이터 백업
      if (localStorage.getItem(BACKUP_KEY) === null) {
        localStorage.setItem(
          BACKUP_KEY,
          raw === null ? "[]" : raw
        );
      }

      // 기존 고객을 삭제하지 않고 새 고객만 추가
      const updatedCustomers = [
        newCustomer,
        ...existing,
      ];

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updatedCustomers)
      );

      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "고객 등록 중 오류가 발생했습니다."
      );
    }
  }

  const missingFields = customer
    ? fields.filter(
        (field) => !customer[field.key].trim()
      )
    : [];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-bold">
        SMART CRM
      </h1>

      <h2 className="mb-3 text-xl font-semibold">
        신청서 고객정보 검토
      </h2>

      <p className="mb-6 text-sm text-gray-500">
        원본 신청서와 고객정보를 비교한 후
        확인된 정보만 CRM에 등록하세요.
      </p>

      <div className="mb-6 rounded-xl border p-4">
        <label className="mb-2 block font-medium">
          Google Drive 파일 ID
        </label>

        <input
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
          className="mb-3 w-full rounded-lg border p-3"
          placeholder="PDF 파일 ID"
        />

        <button
          type="button"
          onClick={runOcr}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 p-3 font-bold text-white disabled:opacity-50"
        >
          {loading
            ? "OCR 인식 중..."
            : "신청서 OCR 불러오기"}
        </button>
      </div>

      {error && (
        <p className="mb-5 rounded-lg border border-red-400 p-3 text-red-600">
          {error}
        </p>
      )}

      {customer && (
        <div className="rounded-xl border p-5">
          <h3 className="mb-3 text-xl font-bold">
            고객정보 확인 및 수정
          </h3>

          {fileName && (
            <p className="mb-3 break-all text-sm text-gray-500">
              신청서: {fileName}
            </p>
          )}

          <a
            href={`/api/google/drive-file?id=${encodeURIComponent(
              loadedFileId
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-5 inline-block text-blue-600 underline"
          >
            원본 신청서 열기
          </a>

          {fields.map((field) => (
            <div key={field.key} className="mb-4">
              <label className="mb-1 block font-medium">
                {field.label}
              </label>

              <input
                type={field.type || "text"}
                value={customer[field.key]}
                disabled={saved}
                onChange={(e) =>
                  updateField(field.key, e.target.value)
                }
                className="w-full rounded-lg border p-3 disabled:bg-gray-100"
              />

              {!customer[field.key].trim() && (
                <p className="mt-1 text-sm text-orange-600">
                  확인 필요
                </p>
              )}
            </div>
          ))}

          <div className="mt-5 rounded-lg border p-4">
            <p className="font-semibold">
              검토 상태
            </p>

            {missingFields.length === 0 ? (
              <p className="mt-1 text-green-600">
                모든 항목이 입력되었습니다.
                원본과 일치하는지 확인해 주세요.
              </p>
            ) : (
              <p className="mt-1 text-orange-600">
                미입력 항목:{" "}
                {missingFields
                  .map((field) => field.label)
                  .join(", ")}
              </p>
            )}
          </div>

          {!saved && (
            <label className="mt-5 flex items-start gap-3">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) =>
                  setReviewed(e.target.checked)
                }
                className="mt-1 h-5 w-5"
              />
              <span className="text-sm">
                원본 신청서와 고객정보를 대조했고,
                등록 내용을 확인했습니다.
              </span>
            </label>
          )}

          {saveError && (
            <p className="mt-4 rounded-lg border border-red-400 p-3 text-red-600">
              {saveError}
            </p>
          )}

          {saved ? (
            <div className="mt-5 rounded-lg border border-green-500 p-4">
              <p className="font-bold text-green-700">
                고객정보 등록 완료
              </p>
              <p className="mt-2 text-sm">
                SMART CRM 고객 목록에 추가했습니다.
              </p>

              <a
                href="/"
                className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-3 font-bold text-white"
              >
                고객 목록 확인하기
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={saveToCrm}
              disabled={!reviewed || loading}
              className="mt-5 w-full rounded-lg bg-blue-600 p-3 font-bold text-white disabled:opacity-50"
            >
              확인 후 SMART CRM에 신규 등록
            </button>
          )}
        </div>
      )}
    </main>
  );
}
