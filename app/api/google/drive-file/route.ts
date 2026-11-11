
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { loadGoogleTokens } from "../../../../lib/google-token";

export const runtime = "nodejs";

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export async function GET(request: NextRequest) {
  // 현재 로컬 개발 환경에서만 허용
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

    // 파일 정보 확인
    const metadata = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,parents,size",
    });

    const file = metadata.data;

    // 지정한 신청서 폴더의 파일인지 확인
    if (!file.parents?.includes(folderId)) {
      return NextResponse.json(
        { success: false, error: "허용되지 않은 폴더의 파일입니다." },
        { status: 403 }
      );
    }

    // PDF, JPG, PNG만 허용
    if (!file.mimeType || !allowedTypes.includes(file.mimeType)) {
      return NextResponse.json(
        { success: false, error: "지원하지 않는 파일 형식입니다." },
        { status: 415 }
      );
    }

    // 최대 20MB
    const maxSize = 20 * 1024 * 1024;
    const size = Number(file.size);

    if (!Number.isFinite(size) || size > maxSize || size < 0) {
      return NextResponse.json(
        { success: false, error: "파일 크기를 확인하거나 20MB 이하 파일을 사용해 주세요." },
        { status: 413 }
      );
    }

    // Google Drive에서 파일 다운로드
    const result = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      {
        responseType: "arraybuffer",
      }
    );

    const buffer = Buffer.from(result.data as ArrayBuffer);

    if (buffer.length > maxSize) {
      return NextResponse.json(
        { success: false, error: "파일 크기가 20MB를 초과합니다." },
        { status: 413 }
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Google Drive 파일 가져오기 실패:",
      error instanceof Error ? error.name : "UnknownError"
    );

    return NextResponse.json(
      {
        success: false,
        error: "Google Drive 파일을 가져오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
