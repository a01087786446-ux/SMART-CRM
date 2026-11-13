
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { extractCustomer } from "../../../../lib/ocr/extract-customer";
import { loadGoogleTokens } from "../../../../lib/google-token";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // 현재는 로컬 개발 환경에서만 테스트합니다.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "개발 환경 전용 API입니다." },
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

    const drive = google.drive({
      version: "v3",
      auth,
    });

    // 지정된 신청서 폴더의 PDF인지 확인
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
        { success: false, error: "PDF 파일만 지원합니다." },
        { status: 415 }
      );
    }

    const maxSize = 20 * 1024 * 1024;
    const fileSize = Number(file.size);

    if (
      !Number.isFinite(fileSize) ||
      fileSize <= 0 ||
      fileSize > maxSize
    ) {
      return NextResponse.json(
        { success: false, error: "20MB 이하 PDF만 지원합니다." },
        { status: 413 }
      );
    }

    // Google Drive에서 PDF 다운로드
    const download = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(
      download.data as ArrayBuffer
    );

    if (buffer.length === 0 || buffer.length > maxSize) {
      return NextResponse.json(
        { success: false, error: "PDF 크기가 올바르지 않습니다." },
        { status: 413 }
      );
    }

    // PDF.js 설정
    const pdfjs = await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    );

    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");

    const workerPath = path.join(
      process.cwd(),
      "lib",
      "pdf.worker.mjs"
    );

    pdfjs.GlobalWorkerOptions.workerSrc =
      pathToFileURL(workerPath).href;

const pdfOptions = {
  data: new Uint8Array(buffer),
  useSystemFonts: true,
  isEvalSupported: false,
  disableFontFace: true,
};

const loadingTask = pdfjs.getDocument(pdfOptions);
const pdf = await loadingTask.promise;

    try {

      // PDF 최대 5페이지까지 OCR 처리
      const maxPages = 5;

      if (pdf.numPages > maxPages) {
        return NextResponse.json(
          {
            success: false,
            error: `현재는 최대 ${maxPages}페이지 PDF만 지원합니다.`,
          },
          { status: 413 }
        );
      }

      const worker = await createWorker("kor+eng");

      try {
        const pageResults: {
          page: number;
          textLength: number;
          text: string;
        }[] = [];

        for (
          let pageNumber = 1;
          pageNumber <= pdf.numPages;
          pageNumber++
        ) {
          const page = await pdf.getPage(pageNumber);

          try {
            const viewport = page.getViewport({
              scale: 2,
            });

            const width = Math.ceil(viewport.width);
            const height = Math.ceil(viewport.height);

            if (
              width <= 0 ||
              height <= 0 ||
              width * height > 16000000
            ) {
              return NextResponse.json(
                {
                  success: false,
                  error: `${pageNumber}페이지 크기가 너무 큽니다.`,
                },
                { status: 413 }
              );
            }

            const canvas = createCanvas(width, height);
            const context = canvas.getContext("2d");

            await page.render({
              canvasContext: context as any,
              viewport,
              canvas: canvas as any,
            }).promise;

            const png = await canvas.encode("png");

            const result = await worker.recognize(
              Buffer.from(png)
            );

            const text = result.data.text.trim();

            pageResults.push({
              page: pageNumber,
              textLength: text.length,
              text,
            });
          } finally {
            page.cleanup();
          }
        }

        const combinedText = pageResults
          .map(
            (result) =>
              `[${result.page}페이지]\n${result.text}`
          )
          .join("\n\n");
const customer = extractCustomer(combinedText);

return NextResponse.json({
  success: true,
  fileName: file.name,
  totalPages: pdf.numPages,
  processedPages: pageResults.length,
  hasText: pageResults.some(
    (result) => result.textLength > 0
  ),
  textLength: combinedText.length,
  text: combinedText,
  pages: pageResults,

  // OCR 문장에서 추출한 고객정보
  customer,

  // 아직 고객 등록은 실행하지 않습니다.
  savedToCRM: false,
});

      } finally {
        await worker.terminate();
      }

} finally {
  await loadingTask.destroy();
}
  } catch (error) {
    console.error(
      "스캔 PDF OCR 오류:",
      error instanceof Error ? error.message : "UnknownError"
    );

    return NextResponse.json(
      {
        success: false,
        error: "스캔 PDF OCR 처리에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}
