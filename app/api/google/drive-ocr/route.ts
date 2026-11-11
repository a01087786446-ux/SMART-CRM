
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { loadGoogleTokens } from "../../../../lib/google-token";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // 개발용 API: 외부 공개 금지
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "개발 환경 전용 API입니다." },
      { status: 403 }
    );
  }

  // 로컬 컴퓨터에서만 요청 허용
  const hostname = request.nextUrl.hostname;

  if (!["localhost", "127.0.0.1"].includes(hostname)) {
    return NextResponse.json(
      { success: false, error: "로컬 접근만 허용합니다." },
      { status: 403 }
    );
  }

  try {
    const fileId = request.nextUrl.searchParams.get("id");
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!fileId || !folderId) {
      return NextResponse.json(
        { success: false, error: "파일 ID 또는 폴더 설정이 없습니다." },
        { status: 400 }
      );
    }

    const tokens = await loadGoogleTokens();

    if (!tokens?.refresh_token) {
      return NextResponse.json(
        { success: false, error: "Google 계정을 다시 연결해 주세요." },
        { status: 401 }
      );
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const drive = google.drive({ version: "v3", auth });

    // 파일이 지정된 신청서 폴더에 있는지 확인
    const metadata = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,parents,size",
    });

    const file = metadata.data;

    if (!file.parents?.includes(folderId)) {
      return NextResponse.json(
        { success: false, error: "허용되지 않은 폴더입니다." },
        { status: 403 }
      );
    }

    if (file.mimeType !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "PDF 파일만 처리할 수 있습니다." },
        { status: 415 }
      );
    }

    const maxSize = 20 * 1024 * 1024;
    const size = Number(file.size);

    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      size > maxSize
    ) {
      return NextResponse.json(
        { success: false, error: "20MB 이하 PDF만 처리할 수 있습니다." },
        { status: 413 }
      );
    }

    // Google Drive에서 PDF 가져오기
    const download = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(download.data as ArrayBuffer);

    if (buffer.length === 0 || buffer.length > maxSize) {
      return NextResponse.json(
        { success: false, error: "PDF 파일 크기가 올바르지 않습니다." },
        { status: 413 }
      );
    }

    // PDF.js로 텍스트 추출
    const pdfjs = await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    );

const { pathToFileURL } = await import("node:url");
const path = await import("node:path");

const workerPath = path.join(
  process.cwd(),
  "lib",
  "pdf.worker.mjs"
);

pdfjs.GlobalWorkerOptions.workerSrc =
  pathToFileURL(workerPath).href;

    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;

    const pageCount = pdf.numPages;

    if (pageCount > 20) {
      if (typeof pdf.destroy === "function") {
  await pdf.destroy();
}

      return NextResponse.json(
        { success: false, error: "20페이지 이하 PDF만 처리할 수 있습니다." },
        { status: 413 }
      );
    }

    const pageTexts: string[] = [];

    try {
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");

        pageTexts.push(text);
        page.cleanup();
      }
    } finally {
      if (typeof pdf.destroy === "function") {
  await pdf.destroy();
}
    }

    const extractedText = pageTexts.join("\n\n");

    // 개인정보가 포함될 수 있으므로
    // 서버 로그에는 추출 내용을 출력하지 않습니다.
    return NextResponse.json({
      success: true,
      fileName: file.name,
      pageCount,
      hasText: extractedText.trim().length > 0,
      textLength: extractedText.length,
      text: extractedText,
    });
  } catch (error) {
   
const errorName =
  error instanceof Error ? error.name : "UnknownError";

const errorMessage =
  error instanceof Error ? error.message : "UnknownError";

console.error("PDF 텍스트 추출 오류 이름:", errorName);
console.error("PDF 텍스트 추출 오류 내용:", errorMessage);

  }
}
