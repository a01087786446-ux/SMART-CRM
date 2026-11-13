
"use client";

import { useCallback, useEffect, useState } from "react";

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: string | null;
};

type DriveResponse = {
  success: boolean;
  folderName?: string;
  files?: DriveFile[];
  error?: string;
};

type OCRResponse = {
  success: boolean;
  fileName?: string;
  processedPages?: number;
  customer?: Record<string, unknown> | null;
  savedToCRM?: boolean;
  error?: string;
};
type CustomerDraft = {
  name: string;
  phone: string;
  carrier: string;
  device: string;
  plan: string;
  openDate: string;
  endDate: string;
};

export default function DriveFilesPanel({
  onRegister,
}: {
  onRegister: (draft: CustomerDraft) => void;
}) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderName, setFolderName] = useState("SMART_CRM_신청서");

  const [ocrLoadingId, setOcrLoadingId] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResponse | null>(null);
const [editedCustomer, setEditedCustomer] =
  useState<Record<string, string>>({});
  const [ocrError, setOcrError] = useState("");

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/google/drive-files", {
        cache: "no-store",
      });

      const data: DriveResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "신청서 목록 조회 실패");
      }

      setFiles(Array.isArray(data.files) ? data.files : []);
      setFolderName(data.folderName || "SMART_CRM_신청서");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function recognizeFile(file: DriveFile) {
    setOcrLoadingId(file.id);
    setOcrResult(null);
    setOcrError("");

    try {
      const response = await fetch(
        `/api/google/drive-scan-ocr?id=${encodeURIComponent(file.id)}`,
        { cache: "no-store" }
      );

      const data: OCRResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "OCR 인식 실패");
      }

      setOcrResult(data);

setEditedCustomer(
  Object.fromEntries(
    Object.entries(data.customer ?? {}).map(([key, value]) => [
      key,
      value == null
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value),
    ])
  )
);

const customerFields = Object.entries(editedCustomer);

  } catch (err) {
    setOcrError(
      err instanceof Error ? err.message : "OCR 처리 중 오류 발생"
    );
  } finally {
    setOcrLoadingId(null);
  }
}

const customerFields = Object.entries(editedCustomer);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          연결 폴더: {folderName}
        </p>

        <button
          type="button"
          onClick={() => void loadFiles()}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {loading && <p>신청서 목록을 불러오는 중입니다...</p>}

      {!loading && error && (
        <p role="alert" className="text-red-600">
          오류: {error}
        </p>
      )}

      {!loading && !error && files.length === 0 && (
        <p className="text-slate-500">
          등록된 신청서가 없습니다.
        </p>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="space-y-3">
          <p className="font-bold">신청서 {files.length}개</p>

          <ul className="divide-y rounded-lg border border-slate-200">
            {files.map((file) => (
              <li key={file.id} className="space-y-3 p-4">
                <div>
                  <p className="break-all font-medium">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {file.mimeType === "application/pdf"
                      ? "PDF 신청서"
                      : "이미지 신청서"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/google/drive-file?id=${encodeURIComponent(file.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white"
                  >
                    파일 열기
                  </a>

                  {file.mimeType === "application/pdf" && (
                    <button
                      type="button"
                      onClick={() => void recognizeFile(file)}
                      disabled={ocrLoadingId !== null}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {ocrLoadingId === file.id
                        ? "OCR 인식 중..."
                        : "OCR 고객정보 검토"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ocrLoadingId && (
        <p role="status" className="text-blue-600">
          PDF를 분석하고 있습니다. 잠시 기다려주세요.
        </p>
      )}

      {ocrError && (
        <p role="alert" className="text-red-600">
          OCR 오류: {ocrError}
        </p>
      )}

      {ocrResult && (
        <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h4 className="text-lg font-bold">
            OCR 고객정보 검토
          </h4>

          <p className="break-all text-sm text-slate-600">
            파일: {ocrResult.fileName}
          </p>

          <p className="text-sm text-slate-600">
            처리 페이지: {ocrResult.processedPages ?? 0}
          </p>

          {customerFields.length > 0 ? (
            <div className="space-y-2">
              {customerFields.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg bg-white p-3"
                >
                  <p className="text-xs text-slate-500">
                    {key}
                  </p>

<input
  type="text"
  value={value}
  onChange={(e) =>
    setEditedCustomer((previous) => ({
      ...previous,
      [key]: e.target.value,
    }))
  }
  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
/>

                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600">
              추출된 고객정보가 없습니다.
            </p>
          )}


<div className="space-y-3">
  <p className="text-sm text-slate-600">
    고객정보를 확인한 후 등록 버튼을 눌러주세요.
    등록 전 중복 확인과 최종 확인 절차가 진행됩니다.
  </p>

  <button
    type="button"
    onClick={() =>
      onRegister({
        name: editedCustomer.name ?? "",
        phone: editedCustomer.phone ?? "",
        carrier: editedCustomer.carrier ?? "",
        device: editedCustomer.device ?? "",
        plan: editedCustomer.plan ?? "",
        openDate: editedCustomer.openDate ?? "",
        endDate: editedCustomer.endDate ?? "",
      })
    }
    className="rounded-lg bg-green-600 px-5 py-3 font-bold text-white hover:bg-green-700"
  >
    검토 완료 후 고객 등록
  </button>
</div>

        </section>
      )}
    </div>
  );
}
