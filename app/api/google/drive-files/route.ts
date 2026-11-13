
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { loadGoogleTokens } from "../../../../lib/google-token";

export const runtime = "nodejs";

export async function GET() {
  // 현재는 로컬 개발 환경에서만 사용합니다.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "개발 환경 전용 API입니다." },
      { status: 403 }
    );
  }

  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Google Drive 폴더 설정이 없습니다." },
        { status: 500 }
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

    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`,
      fields:
        "nextPageToken,files(id,name,mimeType,size,createdTime)",
      pageSize: 100,
      orderBy: "createdTime desc",
    });

    const files = (result.data.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime,
    }));

    return NextResponse.json({
      success: true,
      folderName: "SMART_CRM_신청서",
      fileCount: files.length,
      hasMore: Boolean(result.data.nextPageToken),
      files,
    });
  } catch (error) {
    const detail = error as {
  code?: string | number;
  status?: number;
  response?: { status?: number };
};

console.error("Google Drive 파일 목록 조회 실패:", {
  name: error instanceof Error ? error.name : "UnknownError",
  code: detail.code ?? null,
  status: detail.response?.status ?? detail.status ?? null,
});

    return NextResponse.json(
      {
        success: false,
        error: "신청서 파일 목록을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
