
"use client";

import { useEffect, useState } from "react";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  createdTime?: string | null;
};

export default function DriveFilesPage() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadFiles() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/google/drive-files",
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "파일 목록 조회 실패"
        );
      }

      setFiles(data.files ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "알 수 없는 오류"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
  }, []);

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>SMART CRM 신청서 관리</h1>

      <p>
        Google Drive 신청서 폴더의
        사진 및 PDF 목록입니다.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <button
          onClick={() => void loadFiles()}
          disabled={loading}
          style={{
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          {loading ? "불러오는 중..." : "목록 새로고침"}
        </button>

        <a
          href="/"
          style={{ padding: "10px 0" }}
        >
          고객관리 화면으로 돌아가기
        </a>
      </div>

      {error && (
        <p style={{ color: "red" }}>
          오류: {error}
        </p>
      )}

      {!loading && !error && (
        <p>신청서 파일: {files.length}개</p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ padding: 12, textAlign: "left" }}>
                파일명
              </th>
              <th style={{ padding: 12, textAlign: "left" }}>
                종류
              </th>
              <th style={{ padding: 12, textAlign: "left" }}>
                등록일
              </th>
            </tr>
          </thead>

          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {file.name}

<a
  href={`/drive-review?id=${encodeURIComponent(file.id)}`}
  target="_blank"
  rel="noopener noreferrer"
  style={{
    display: "inline-block",
    marginLeft: 12,
    padding: "6px 12px",
    backgroundColor: "#2563eb",
    color: "white",
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 13,
  }}
>
  고객정보 검토
</a>

                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {file.mimeType === "application/pdf"
                    ? "PDF"
                    : "사진"}
                </td>

                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {file.createdTime
                    ? new Date(
                        file.createdTime
                      ).toLocaleDateString("ko-KR")
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && !error && files.length === 0 && (
        <p style={{ marginTop: 20 }}>
          등록된 신청서 파일이 없습니다.
        </p>
      )}
    </main>
  );
}
